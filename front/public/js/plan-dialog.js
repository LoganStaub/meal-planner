// The "Add to meal plan" popup (views/partials/plan-dialog.ejs,
// css/plan-dialog.css), used by the Home page and the recipe page:
//   PlanDialog.open({ recipe_id, recipe_title, recipe_class_desc }, { entryPoint })
//
// Pick a day and a meal, then POST /api/me/calendar. The server knows who is
// logged in (the login session), so no user id is sent.
//
// The popup logs add_to_calendar_started / _cancelled / _error for the OKR
// numbers (js/events.js). entryPoint says which button opened it; the server
// logs add_to_calendar_completed with the same entry point.

(() => {
    // Same numbers as calendar.meal_slot (back/db/schema.sql)
    const MEAL_SLOTS = { 1: "Breakfast", 2: "Lunch", 3: "Dinner", 4: "Snack", 5: "Dessert" };

    // Builds an element with text. Everything from the server goes through
    // textContent, never innerHTML.
    function el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    // Logged out in another tab: log in again, then come back here
    function goToLogin() {
        location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }

    const plan = document.getElementById("plan-dialog");
    const planForm = document.getElementById("plan-form");
    const planDate = document.getElementById("plan-date");
    const planMessage = document.getElementById("plan-message");
    const planSubmit = document.getElementById("plan-submit");
    const planChoose = document.getElementById("plan-choose");
    const planDone = document.getElementById("plan-done");
    const planDoneLink = document.getElementById("plan-done-link");
    if (!plan) return;

    // The recipe being added: { recipe_id, recipe_title, recipe_class_desc }
    let planRecipe = null;
    // Set when the recipe is already planned in another meal that day and
    // the user is being asked whether to add it again
    let confirmDuplicate = false;
    // Which button opened the popup: "recipe_details" or "home_card"
    let planEntryPoint = "recipe_details";
    // True once the recipe is saved, so closing afterwards isn't a cancel
    let planSaved = false;

    function trackPlan(eventName, extra = {}) {
        window.logEvent?.(eventName, {
            entry_point: planEntryPoint,
            recipe_id: planRecipe?.recipe_id,
            ...extra,
        });
    }

    // A problem caught here in the browser. Errors from the server are
    // logged by the server (back/src/routes/calendar.js).
    function showPlanError(text) {
        showPlanMessage(text);
        trackPlan("add_to_calendar_error", { message: text, source: "client" });
    }

    // "2026-11-10" in the visitor's own time zone
    function dateKey(date = new Date()) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    // "2026-11-10" -> "Tuesday, Nov 10"
    function formatDay(key) {
        return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
            weekday: "long", month: "short", day: "numeric",
        });
    }

    // Start on the recipe's own meal type, or else the next meal of the day
    function defaultMealSlot(recipe) {
        const fromClass = Object.keys(MEAL_SLOTS).find((slot) => MEAL_SLOTS[slot] === recipe.recipe_class_desc);
        if (fromClass) return fromClass;
        const hour = new Date().getHours();
        return hour < 10 ? "1" : hour < 15 ? "2" : "3";
    }

    // After pressing + on the meal plan, the day and meal the user came to
    // fill are in #plan-banner: the Recipes page's banner (views/search.ejs)
    // or a hidden copy on the recipe page (views/recipe.ejs)
    function dayFromCalendar() {
        const banner = document.getElementById("plan-banner");
        return { date: banner?.dataset.date || "", slot: banner?.dataset.slot || "" };
    }

    function selectedSlot() {
        const checked = planForm.querySelector('input[name="meal_slot"]:checked');
        return checked ? Number(checked.value) : null;
    }

    function showPlanMessage(text) {
        planMessage.textContent = text;
        planMessage.hidden = !text;
    }

    function resetDuplicateQuestion() {
        confirmDuplicate = false;
        planSubmit.textContent = "Add to meal plan";
        showPlanMessage("");
    }

    function openPlan(recipe, { entryPoint = "recipe_details" } = {}) {
        planRecipe = recipe;
        planEntryPoint = entryPoint;
        planSaved = false;
        document.getElementById("plan-recipe").textContent = recipe.recipe_title;

        const today = dateKey();
        const coming = dayFromCalendar();
        planDate.min = today;
        planDate.value = coming.date >= today ? coming.date : today;
        const slot = MEAL_SLOTS[coming.slot] ? coming.slot : defaultMealSlot(recipe);
        planForm.querySelector(`input[name="meal_slot"][value="${slot}"]`).checked = true;

        resetDuplicateQuestion();
        planSubmit.disabled = false;
        planChoose.hidden = false;
        planDone.hidden = true;
        plan.showModal();
        trackPlan("add_to_calendar_started");
    }

    async function savePlan() {
        const date = planDate.value;
        const slot = selectedSlot();
        if (!date) { showPlanError("Choose a day."); planDate.focus(); return; }
        if (date < planDate.min) { showPlanError("Choose today or a later day."); planDate.focus(); return; }
        if (!slot) { showPlanError("Choose a meal."); return; }

        planSubmit.disabled = true;
        showPlanMessage("");
        try {
            const response = await fetch("/api/me/calendar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date,
                    meal_slot: slot,
                    recipe_id: planRecipe.recipe_id,
                    allow_duplicate: confirmDuplicate,
                    entry_point: planEntryPoint,
                }),
            });
            const body = await response.json().catch(() => ({}));

            if (response.status === 401) {
                goToLogin();
                return;
            }
            if (response.status === 409 && body.code === "already_planned") {
                const slots = body.meal_slots || [];
                const where = slots.map((s) => (MEAL_SLOTS[s] || "another meal").toLowerCase()).join(" and ");
                if (slots.includes(slot)) {
                    // The same recipe can't be in the same meal twice
                    showPlanMessage(`It's already planned for ${where} on ${formatDay(date)}. Pick another day or meal.`);
                } else {
                    confirmDuplicate = true;
                    planSubmit.textContent = "Add anyway";
                    showPlanMessage(`It's already planned for ${where} on ${formatDay(date)}. Add it to ${MEAL_SLOTS[slot].toLowerCase()} too?`);
                }
                return;
            }
            if (!response.ok) throw new Error(body.error || "Couldn't add it to your meal plan. Please try again.");

            planSaved = true;
            document.getElementById("plan-done-text").replaceChildren(
                el("strong", "", planRecipe.recipe_title || "The recipe"),
                ` is on your meal plan for ${MEAL_SLOTS[slot].toLowerCase()} on ${formatDay(date)}.`);
            planDoneLink.href = `/calendar?date=${encodeURIComponent(date)}`;
            planChoose.hidden = true;
            planDone.hidden = false;
            planDoneLink.focus();
        } catch (error) {
            if (error instanceof TypeError) {
                // Never reached the server, so the server couldn't log it
                showPlanError("Couldn't reach the server. Please try again.");
            } else {
                showPlanMessage(error.message);
            }
        } finally {
            planSubmit.disabled = false;
        }
    }

    planForm.addEventListener("submit", (event) => {
        event.preventDefault();
        savePlan();
    });

    // Changing the day or meal means a new question, so drop the old one
    planDate.addEventListener("change", resetDuplicateQuestion);
    planForm.addEventListener("change", (event) => {
        if (event.target.name === "meal_slot") resetDuplicateQuestion();
    });

    for (const button of plan.querySelectorAll("[data-plan-close]")) {
        button.addEventListener("click", () => plan.close());
    }
    // Clicking the dimmed background closes the popup
    plan.addEventListener("click", (event) => {
        if (event.target === plan) plan.close();
    });
    // Closed without saving (Cancel, ×, the background or Esc)
    plan.addEventListener("close", () => {
        if (!planSaved) trackPlan("add_to_calendar_cancelled");
    });

    window.PlanDialog = { open: openPlan };
})();
