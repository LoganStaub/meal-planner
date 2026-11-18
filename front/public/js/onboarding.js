// The first-visit tour (partials/onboarding.ejs, css/onboarding.css).
//
// 1. The welcome popup opens by itself while the account has never been
//    offered the tour (the server only renders it then).
//    "Show me around" saves 'started', "No thanks" saves 'skipped'
//    (POST /api/me/onboarding, back/src/routes/onboarding.js), so either way
//    it is never offered again. Leaving the tour partway keeps 'started'.
// 2. The tour goes page by page through STEPS, highlighting one element on
//    each step (marked with data-tour="..." in the page's view). Which step
//    we're on is kept in sessionStorage so it carries across page loads.
//    On the Meal Plan step, if tonight has no dinner yet, the user is offered
//    a real dinner recipe to add (GET/POST /api/me/onboarding/dinner). It's
//    only saved when they tap "Add to my plan", and later steps (Shopping,
//    the last card) mention it.
// 3. Reaching the last step saves 'completed'.
// However it ends, the tour drops the user off on Home (endTour).
// "Take the tour" in the profile menu replays it any time.
(function () {
    const STORAGE_KEY = "preply-tour-step";
    // The recipe title, once the user added tonight's dinner during this tour
    const DINNER_KEY = "preply-tour-dinner";

    // page: where the step happens (path to go to, pattern to recognise it)
    // target: the data-tour="..." to highlight; none = a card in the middle
    const PAGES = {
        home: { path: "/home", match: /^\/(home|index\.html)\/?$/ },
        recipes: { path: "/recipes", match: /^\/recipes\/?$/ },
        plan: { path: "/calendar", match: /^\/calendar(\.html)?\/?$/ },
        pantry: { path: "/pantry", match: /^\/pantry(\.html|\.ejs)?\/?$/ },
        shopping: { path: "/shopping", match: /^\/shopping(\.html)?\/?$/ },
        liked: { path: "/liked", match: /^\/liked(\.html)?\/?$/ },
    };

    const STEPS = [
        {
            page: "home",
            target: "home-card",
            title: "Home: today's picks",
            text: "A few meal ideas for right now. Swipe or use the arrows to browse, tap ♥ to save one, and Add to meal plan to put it on a day.",
        },
        {
            page: "recipes",
            target: "recipes-search",
            title: "Recipes: find anything",
            text: "Search every recipe by name or ingredient and narrow it down with the filters. Open a recipe to see its ingredients, steps and ratings.",
        },
        {
            page: "recipes",
            target: "recipes-add",
            title: "Add your own recipes",
            text: "Paste or type a recipe you love and our AI assistant fills in the details, like cook time and cost. You check it over, then save it.",
        },
        {
            page: "plan",
            target: "plan-week",
            title: "Meal Plan: your week",
            text: "Pick a day, then add dishes for breakfast, lunch, dinner and more. Use the arrows to plan ahead.",
            // Offers to plan tonight's dinner (showDinner)
            dinner: true,
        },
        {
            page: "pantry",
            target: "pantry-amounts",
            title: "Pantry: what's at home",
            text: "Add what you have and mark it Plenty left, Running low or None. Your shopping list leaves out what you already have.",
        },
        {
            page: "shopping",
            target: "shopping-list",
            title: "Shopping: built for you",
            text: () => readDinner()
                ? `Here's what ${readDinner()} needs, minus what's in your pantry. Anything else you plan for the next 7 days shows up here too. Tick items off as you shop and they go into your pantry.`
                : "Everything the next 7 days of your meal plan needs, minus your pantry. Tick items off as you shop and they go into your pantry.",
        },
        {
            page: "liked",
            target: "liked-count",
            title: "Liked recipes",
            text: "Every recipe you ♥ lands here, ready to rate after you cook it.",
        },
        {
            page: "liked",
            selector: "#profile-trigger",
            title: "Your profile menu",
            text: "Account settings, your password and this tour live here.",
        },
        {
            page: "liked",
            title: "You're all set!",
            // The nudge to plan one on their own (the tour's dinner doesn't count toward the OKRs)
            text: () => readDinner()
                ? "Tonight's dinner is sorted. Now try one on your own: open Meal Plan, pick a day and tap + to add a meal. You've got this!"
                : "Now try planning your first meal: open Meal Plan, pick a day and tap + to add a meal. Your shopping list fills in by itself.",
            last: true,
        },
    ];

    const welcome = document.getElementById("onboarding-welcome");
    const replayButton = document.getElementById("onboarding-replay");

    // ---------- Saving and logging ----------

    function saveStatus(status) {
        return fetch("/api/me/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
            keepalive: true,
        }).catch((error) => console.error("Could not save the tour status:", error));
    }

    // Same as window.logEvent (js/events.js), which not every page loads
    function logStep(index) {
        fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event_name: "onboarding_step_viewed",
                metadata: { step: index + 1, of: STEPS.length, page: STEPS[index].page },
            }),
            keepalive: true,
        }).catch(() => {});
    }

    // sessionStorage can throw (blocked site data); the tour then just ends
    function readStep() {
        try {
            const value = sessionStorage.getItem(STORAGE_KEY);
            return value === null ? null : Number(value);
        } catch {
            return null;
        }
    }

    function writeStep(index) {
        try {
            if (index === null) sessionStorage.removeItem(STORAGE_KEY);
            else sessionStorage.setItem(STORAGE_KEY, String(index));
        } catch {
            // Ignore: see readStep
        }
    }

    function readDinner() {
        try {
            return sessionStorage.getItem(DINNER_KEY);
        } catch {
            return null;
        }
    }

    function writeDinner(title) {
        try {
            if (title === null) sessionStorage.removeItem(DINNER_KEY);
            else sessionStorage.setItem(DINNER_KEY, title);
        } catch {
            // Ignore: see readStep
        }
    }

    // Today as YYYY-MM-DD in the user's own time zone, like the Meal Plan page
    function todayKey() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    function currentPage() {
        return Object.keys(PAGES).find((key) => PAGES[key].match.test(location.pathname));
    }

    // ---------- Starting and leaving ----------

    // Shows step `index`, loading its page first when it's somewhere else
    function goTo(index) {
        writeStep(index);
        const page = PAGES[STEPS[index].page];
        if (page.match.test(location.pathname)) showStep(index);
        else location.href = page.path;
    }

    // From the welcome popup, or replayed from the profile menu
    function startTour({ firstTime = false } = {}) {
        if (firstTime) saveStatus("started");
        writeDinner(null);
        goTo(0);
    }

    // However the tour ends (finished or ended early), it drops the user off
    // on Home, or on `path` when given (e.g. "Plan a meal").
    function endTour(path = PAGES.home.path) {
        writeStep(null);
        writeDinner(null);
        removeTour();
        if (location.pathname !== path && !(path === PAGES.home.path && PAGES.home.match.test(location.pathname))) {
            location.href = path;
        }
    }

    // ---------- Drawing a step ----------

    let tour = null; // { root, spot, card, target, observer, inerted, step }

    function build() {
        const root = document.createElement("div");
        root.className = "tour";
        root.innerHTML = `
            <div class="tour-blocker"></div>
            <div class="tour-spot" hidden></div>
            <section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
                <div class="tour-card-top">
                    <p class="tour-progress"></p>
                    <button type="button" class="tour-close" aria-label="Exit tour" title="Exit tour">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>
                    </button>
                </div>
                <h2 class="tour-title" id="tour-title"></h2>
                <p class="tour-text" id="tour-text"></p>
                <div class="tour-extra"></div>
                <div class="tour-dots" aria-hidden="true"></div>
                <div class="tour-actions"></div>
                <div class="tour-confirm" hidden>
                    <h2 class="tour-title" id="tour-confirm-title">End the tour?</h2>
                    <p class="tour-text">You can take it again any time from your profile menu.</p>
                    <div class="tour-actions">
                        <button type="button" class="onboarding-btn" data-confirm="end">End tour</button>
                        <button type="button" class="onboarding-btn onboarding-btn-primary" data-confirm="stay">Keep going</button>
                    </div>
                </div>
            </section>`;
        document.body.append(root);

        // Everything else on the page can't be clicked or focused meanwhile
        const inerted = [...document.body.children].filter((el) => el !== root && !el.inert && el.tagName !== "SCRIPT");
        inerted.forEach((el) => { el.inert = true; });

        root.querySelector(".tour-close").addEventListener("click", askToEnd);
        root.querySelector(".tour-blocker").addEventListener("click", () => root.querySelector(".tour-card").focus());
        root.querySelector('[data-confirm="end"]').addEventListener("click", () => endTour());
        root.querySelector('[data-confirm="stay"]').addEventListener("click", () => showConfirm(false));

        tour = { root, spot: root.querySelector(".tour-spot"), card: root.querySelector(".tour-card"), inerted, step: 0 };
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, { passive: true });
        document.addEventListener("keydown", onKey);
    }

    function removeTour() {
        if (!tour) return;
        tour.observer?.disconnect();
        tour.inerted.forEach((el) => { el.inert = false; });
        tour.root.remove();
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", place);
        document.removeEventListener("keydown", onKey);
        tour = null;
    }

    // ✕ and Escape ask first, so the tour isn't lost by accident. The last
    // step has nothing left to see, so it just closes.
    function askToEnd() {
        if (STEPS[tour.step].last) endTour();
        else showConfirm(true);
    }

    // Swaps the card between the step and "End the tour?"
    function showConfirm(confirming) {
        const { card } = tour;
        card.classList.toggle("tour-confirming", confirming);
        card.querySelector(".tour-confirm").hidden = !confirming;
        card.setAttribute("aria-labelledby", confirming ? "tour-confirm-title" : "tour-title");
        place();
        if (confirming) card.querySelector('[data-confirm="stay"]').focus();
        else card.querySelector(".tour-actions").lastElementChild.focus();
    }

    function onKey(event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        // Escape on "End the tour?" means "Keep going"
        if (tour.card.classList.contains("tour-confirming")) showConfirm(false);
        else askToEnd();
    }

    function button(label, className, onClick) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = `onboarding-btn ${className}`;
        el.textContent = label;
        el.addEventListener("click", onClick);
        return el;
    }

    function showStep(index) {
        const step = STEPS[index];
        if (!tour) build();
        tour.step = index;
        tour.card.classList.remove("tour-confirming");
        tour.card.querySelector(".tour-confirm").hidden = true;
        tour.card.setAttribute("aria-labelledby", "tour-title");

        tour.root.querySelector(".tour-progress").textContent = `${index + 1} of ${STEPS.length}`;
        setText(step.title, typeof step.text === "function" ? step.text() : step.text);
        tour.card.querySelector(".tour-extra").replaceChildren();
        tour.root.querySelector(".tour-dots").replaceChildren(
            ...STEPS.map((_, i) => {
                const dot = document.createElement("span");
                if (i === index) dot.className = "on";
                return dot;
            })
        );

        const actions = tour.root.querySelector(".tour-actions");
        if (step.last) {
            actions.replaceChildren(
                button("Plan a meal", "", () => endTour(PAGES.plan.path)),
                button("Go to Home", "onboarding-btn-primary", () => endTour())
            );
        } else {
            actions.replaceChildren(
                index > 0 ? button("Back", "", () => goTo(index - 1)) : document.createElement("span"),
                button("Next", "onboarding-btn-primary", () => goTo(index + 1))
            );
        }

        setTarget(step.selector || (step.target && `[data-tour="${step.target}"]`));

        if (step.last) saveStatus("completed");
        logStep(index);
        actions.lastElementChild.focus();
        if (step.dinner) showDinner(index);
    }

    function setText(title, text) {
        tour.card.querySelector(".tour-title").textContent = title;
        tour.card.querySelector(".tour-text").textContent = text;
    }

    // Highlights the element matching `selector`, if it's on the page and visible
    function setTarget(selector) {
        tour.observer?.disconnect();
        const target = selector ? document.querySelector(selector) : null;
        tour.target = target && target.getClientRects().length > 0 ? target : null;
        if (tour.target) {
            tour.target.scrollIntoView({ block: "center", behavior: "instant" });
            // Pages fill some elements in after loading (e.g. the week's days)
            tour.observer = new ResizeObserver(place);
            tour.observer.observe(tour.target);
        }
        place();
    }

    // ---------- The Meal Plan step: plan tonight's dinner ----------

    // The step first shows its normal text. If tonight has no dinner yet, it
    // turns into a picker with a real recipe; if it fails to load, the normal
    // step just stays.
    async function showDinner(index) {
        let data;
        try {
            const response = await fetch(`/api/me/onboarding/dinner?date=${todayKey()}`);
            if (!response.ok) return;
            data = await response.json();
        } catch {
            return;
        }
        // They may have moved on while it loaded
        if (!tour || tour.step !== index) return;

        if (data.planned) {
            // Just added on this step (the page reloaded to show it)
            if (readDinner() === data.planned.recipe_title) {
                setText(
                    "Tonight's dinner is planned ✓",
                    `${data.planned.recipe_title} is on your Meal Plan for tonight. It's yours to keep or remove here any time. Next, see what you'll need for it.`
                );
                setTarget('[data-tour="plan-day"]');
            }
            return;
        }
        if (data.suggestions.length === 0) return;

        let choice = 0;
        setText("Let's plan tonight's dinner", "Here's an idea to get you started. Swap it for another, or add it to tonight.");

        const box = document.createElement("div");
        box.className = "tour-dinner";
        box.innerHTML = `
            <div class="tour-dinner-pick">
                <p class="tour-dinner-label">Tonight · Dinner</p>
                <p class="tour-dinner-name"></p>
                <p class="tour-dinner-time"></p>
            </div>`;
        const name = box.querySelector(".tour-dinner-name");
        const time = box.querySelector(".tour-dinner-time");
        const error = document.createElement("p");
        error.className = "tour-dinner-error";
        error.setAttribute("role", "alert");
        error.hidden = true;

        function showChoice() {
            const recipe = data.suggestions[choice];
            name.textContent = recipe.recipe_title;
            time.textContent = recipe.prep_time ? `${recipe.prep_time} min` : "";
            time.hidden = !recipe.prep_time;
        }
        showChoice();

        if (data.suggestions.length > 1) {
            const swap = button("Swap", "tour-dinner-swap", () => {
                choice = (choice + 1) % data.suggestions.length;
                showChoice();
            });
            swap.setAttribute("aria-label", "Swap for another dinner");
            box.append(swap);
        }
        tour.card.querySelector(".tour-extra").replaceChildren(box, error);

        const add = button("Add to my plan", "onboarding-btn-primary", async () => {
            add.disabled = true;
            error.hidden = true;
            const recipe = data.suggestions[choice];
            try {
                const response = await fetch("/api/me/onboarding/dinner", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: todayKey(), recipe_id: recipe.recipe_id }),
                });
                // 409: tonight got a dinner some other way. Reloading shows it.
                if (response.ok) writeDinner(recipe.recipe_title);
                else if (response.status !== 409) throw new Error(`HTTP ${response.status}`);
                // Reload so the Meal Plan shows the new dinner; the tour carries on here
                location.reload();
            } catch {
                error.textContent = "Couldn't add it. Try again, or skip this for now.";
                error.hidden = false;
                add.disabled = false;
                place();
            }
        });
        tour.card.querySelector(".tour-actions").replaceChildren(
            button("Skip this", "", () => goTo(index + 1)),
            add
        );
        place();
        add.focus();
    }

    // Puts the spotlight on the target and the card next to it
    function place() {
        if (!tour) return;
        const { spot, card, target } = tour;
        const margin = 12;
        const gap = 14;
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const rect = target?.getBoundingClientRect();

        tour.root.classList.toggle("tour-centered", !rect);
        if (!rect) {
            spot.hidden = true;
            card.style.left = card.style.top = "";
            return;
        }

        const pad = 6;
        spot.hidden = false;
        spot.style.left = `${rect.left - pad}px`;
        spot.style.top = `${rect.top - pad}px`;
        spot.style.width = `${rect.width + pad * 2}px`;
        spot.style.height = `${rect.height + pad * 2}px`;

        // Below the target if it fits, else above, else over its bottom edge
        const cardBox = card.getBoundingClientRect();
        let top;
        if (rect.bottom + pad + gap + cardBox.height <= vh - margin) top = rect.bottom + pad + gap;
        else if (rect.top - pad - gap - cardBox.height >= margin) top = rect.top - pad - gap - cardBox.height;
        else top = vh - margin - cardBox.height;

        let left = rect.left + rect.width / 2 - cardBox.width / 2;
        left = Math.min(Math.max(left, margin), vw - margin - cardBox.width);

        card.style.left = `${left}px`;
        card.style.top = `${Math.max(top, margin)}px`;
    }

    // ---------- On every page load ----------

    replayButton?.addEventListener("click", () => {
        document.getElementById("profile-menu").hidden = true;
        document.getElementById("profile-trigger")?.setAttribute("aria-expanded", "false");
        startTour();
    });

    const savedStep = readStep();
    if (savedStep !== null && STEPS[savedStep]) {
        // In the middle of the tour. If they went to another page some other
        // way (e.g. the Back button), carry on from that page's first step.
        const page = currentPage();
        const index = STEPS[savedStep].page === page ? savedStep : STEPS.findIndex((step) => step.page === page);
        if (index >= 0) {
            writeStep(index);
            showStep(index);
        } else {
            writeStep(null);
        }
    } else if (welcome) {
        welcome.showModal();
        document.getElementById("onboarding-start").addEventListener("click", () => {
            welcome.close();
            startTour({ firstTime: true });
        });
        document.getElementById("onboarding-skip").addEventListener("click", () => welcome.close());
        // Closing it any way other than "Show me around" (incl. Escape) is "No thanks"
        welcome.addEventListener("close", () => {
            if (readStep() === null) saveStatus("skipped");
        });
    }
})();
