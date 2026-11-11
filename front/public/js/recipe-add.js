// "Add your own recipe" on the Search page.
//
// 1. The user types or pastes a recipe.
// 2. POST …/recipe-assistant/check: the AI checks it is a real recipe and
//    fits it to our database (meal type, units, time, cost, macros).
// 3. The user reviews the result and presses Save.
// 4. POST …/recipe-assistant/drafts/:id/save adds it to the database.
//
// A user can add 3 recipes a day. The server enforces that
// (back/src/recipeAddLimit.js); this page just shows the wall.
//
// The server knows who is logged in (the login session), so no user id
// is sent from here. If nobody is logged in, the popup asks them to log in.

(() => {
    const API = "/api/recipe-assistant";

    const dialog = document.getElementById("recipe-add");
    const openButton = document.getElementById("recipe-add-open");
    if (!dialog || !openButton) return;

    const steps = {
        write: document.getElementById("recipe-add-write"),
        checking: document.getElementById("recipe-add-checking"),
        review: document.getElementById("recipe-add-review"),
        done: document.getElementById("recipe-add-done"),
        wall: document.getElementById("recipe-add-wall"),
        login: document.getElementById("recipe-add-login"),
    };
    const remainingText = document.getElementById("recipe-add-remaining");
    const textarea = document.getElementById("recipe-add-text");
    const counter = document.getElementById("recipe-add-counter");
    const errorBox = document.getElementById("recipe-add-error");
    const checkButton = document.getElementById("recipe-add-check");
    const saveButton = document.getElementById("recipe-add-save");
    const editButton = document.getElementById("recipe-add-edit");
    const reviewError = document.getElementById("recipe-add-review-error");
    const preview = document.getElementById("recipe-add-preview");
    const doneText = document.getElementById("recipe-add-done-text");
    const doneLink = document.getElementById("recipe-add-done-link");
    const wallText = document.getElementById("recipe-add-wall-text");
    const loginLink = document.getElementById("recipe-add-login-link");

    let draftId = null;
    let maxLength = 6000;
    let savedSomething = false;

    function show(name) {
        for (const [key, element] of Object.entries(steps)) element.hidden = key !== name;
    }

    function showError(box, message) {
        box.textContent = message;
        box.hidden = !message;
    }

    // "2 of 3 left today · 4 checks left"
    function showRemaining(body) {
        if (typeof body?.remaining !== "number") return;
        const checks = typeof body.checks_remaining === "number"
            ? ` · ${body.checks_remaining} ${body.checks_remaining === 1 ? "check" : "checks"} left`
            : "";
        remainingText.textContent = `${body.remaining} of ${body.limit} left today${checks}`;
        remainingText.hidden = false;
    }

    function showWall(message) {
        wallText.textContent = message || "You've reached today's limit. You can add more recipes tomorrow.";
        show("wall");
    }

    // Not logged in, or the login expired while the popup was open
    function showLogin(body) {
        // Come back to this page (with its search) after logging in
        const here = location.pathname + location.search;
        if (body?.login_url) loginLink.href = `${body.login_url}?next=${encodeURIComponent(here)}`;
        remainingText.hidden = true;
        show("login");
    }

    function updateCounter() {
        const length = textarea.value.length;
        counter.textContent = `${length} / ${maxLength}`;
        counter.classList.toggle("over", length > maxLength);
    }

    async function request(path, options) {
        let response;
        try {
            response = await fetch(`${API}${path}`, options);
        } catch {
            return { ok: false, status: 0, body: { error: "Couldn't reach the server. Please try again." } };
        }
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) showLogin(body);
        return { ok: response.ok, status: response.status, body };
    }

    function post(path, data) {
        return request(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data ?? {}),
        });
    }

    // Builds an element with text. Everything from the server goes through
    // textContent, never innerHTML.
    function el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function formatPrepTime(minutes) {
        if (minutes < 60) return `${minutes} min`;
        const rest = minutes % 60;
        return rest ? `${Math.floor(minutes / 60)} hr ${rest} min` : `${Math.floor(minutes / 60)} hr`;
    }

    function renderPreview(recipe) {
        const facts = el("ul", "recipe-add-facts");
        for (const fact of [recipe.meal_class, formatPrepTime(recipe.prep_time),
            `Serves ${recipe.servings}`, `About $${recipe.cost.toFixed(2)}`]) {
            facts.append(el("li", "", fact));
        }

        const ingredients = el("ul", "recipe-add-ingredients");
        for (const item of recipe.ingredients) {
            const row = el("li");
            row.append(el("span", "recipe-add-amount", `${item.amount} ${item.measurement.toLowerCase()}`),
                el("span", "", item.name));
            ingredients.append(row);
        }

        const method = el("ol", "recipe-add-steps");
        for (const step of recipe.steps) method.append(el("li", "", step));

        preview.replaceChildren(
            el("h3", "recipe-add-title", recipe.title),
            facts,
            el("p", "recipe-add-macros", recipe.macros),
            el("h4", "", "Ingredients"),
            ingredients,
            el("h4", "", "Steps"),
            method,
        );
        if (recipe.notes) preview.append(el("p", "recipe-add-notes", recipe.notes));
    }

    async function openDialog() {
        draftId = null;
        showError(errorBox, "");
        showError(reviewError, "");
        show("write");
        dialog.showModal();

        const { ok, body } = await request("/status");
        if (!ok) return; // 401 shows the log-in step; the server enforces the limit on Check
        if (body.max_length) maxLength = body.max_length;
        updateCounter();
        showRemaining(body);
        if (body.remaining === 0) {
            showWall(`You've added ${body.limit} recipes today, which is the daily limit. You can add more tomorrow.`);
        } else if (body.checks_remaining === 0) {
            showWall("You've used all of today's recipe checks. Please try again tomorrow.");
        }
    }

    async function checkRecipe() {
        const text = textarea.value.trim();
        if (text.length > maxLength) {
            showError(errorBox, `That recipe is too long. Please keep it under ${maxLength} characters.`);
            return;
        }
        showError(errorBox, "");
        show("checking");

        const { ok, status, body } = await post("/check", { text });
        showRemaining(body);

        if (status === 401) return; // Already showing the log-in step
        if (ok) {
            draftId = body.draft_id;
            renderPreview(body.recipe);
            showError(reviewError, "");
            show("review");
            saveButton.focus();
            return;
        }
        // Out of recipes or out of checks for today
        if (status === 429) {
            showWall(body.error);
            return;
        }
        // Not a recipe, a duplicate, too short, or the assistant is unavailable
        show("write");
        showError(errorBox, body.error || "Something went wrong. Please try again.");
        textarea.focus();
    }

    async function saveRecipe() {
        saveButton.disabled = true;
        editButton.disabled = true;
        showError(reviewError, "");

        const { ok, status, body } = await post(`/drafts/${encodeURIComponent(draftId)}/save`);
        saveButton.disabled = false;
        editButton.disabled = false;
        showRemaining(body);

        if (status === 401) return;
        if (ok) {
            savedSomething = true;
            textarea.value = "";
            updateCounter();
            doneText.replaceChildren(el("strong", "", body.recipe_title), " is now in the recipe list.");
            doneLink.href = `/search?q=${encodeURIComponent(body.recipe_title)}`;
            show("done");
            doneLink.focus();
            return;
        }
        if (status === 429) {
            showWall(body.error);
            return;
        }
        if (status === 404) {
            // The check expired (30 minutes) or the server restarted
            show("write");
            showError(errorBox, body.error || "Please check the recipe again.");
            return;
        }
        showError(reviewError, body.error || "Couldn't save the recipe. Please try again.");
    }

    openButton.addEventListener("click", openDialog);
    textarea.addEventListener("input", updateCounter);
    steps.write.addEventListener("submit", (event) => {
        event.preventDefault();
        checkRecipe();
    });
    saveButton.addEventListener("click", saveRecipe);
    editButton.addEventListener("click", () => {
        show("write");
        textarea.focus();
    });

    for (const button of dialog.querySelectorAll("[data-close]")) {
        button.addEventListener("click", () => dialog.close());
    }
    // Clicking the dimmed backdrop closes, like the calendar's popups
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    // Show the new recipe in the results once the dialog is closed
    dialog.addEventListener("close", () => {
        if (savedSomething) location.reload();
    });
})();
