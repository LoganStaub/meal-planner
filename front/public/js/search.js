// Recipes page. Only loaded when the page came from a calendar + button (/recipes?date=…&slot=…).
// "Add to dinner" etc. saves the recipe to that day and meal, then goes back
// to the calendar on that day.

// Saves to /api/me/calendar: the server knows who is logged in, so no user id is sent.
//
// For the OKR numbers (js/events.js): the calendar's + link logged
// add_to_calendar_started; this page logs a cancel when the user leaves the
// banner (× or Back to calendar) or says no to adding a repeat, and an error
// for problems caught in the browser. The server logs the completed add
// and its own errors, with entry_point "calendar".
// Same numbers as calendar.meal_slot (see back/db/schema.sql)
const MEAL_SLOTS = { 1: "Breakfast", 2: "Lunch", 3: "Dinner", 4: "Snack", 5: "Dessert" };

const planBanner = document.getElementById("plan-banner");
const slotSelect = document.getElementById("plan-slot-select");
const pageError = document.getElementById("page-error");
const pageErrorMessage = document.getElementById("page-error-message");
const duplicateDialog = document.getElementById("confirm-duplicate");
const duplicateTitle = document.getElementById("confirm-duplicate-title");
const duplicateText = document.getElementById("confirm-duplicate-text");
const duplicateCancel = document.getElementById("confirm-duplicate-cancel");
const duplicateAdd = document.getElementById("confirm-duplicate-add");

// Each option's value is the /recipes link for that meal
slotSelect.addEventListener("change", () => {
    if (slotSelect.value) location.href = slotSelect.value;
});

function showError(message) {
    pageErrorMessage.textContent = message;
    pageError.hidden = false;
    pageError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function track(eventName, metadata = {}) {
    window.logEvent?.(eventName, { entry_point: "calendar", ...metadata });
}

// A problem the server never saw (it logs its own errors)
function showClientError(message, recipeId) {
    showError(message);
    track("add_to_calendar_error", { message, recipe_id: recipeId, source: "client" });
}

// Leaving the "Adding to …" banner without adding anything
for (const link of planBanner.querySelectorAll(".plan-dismiss, .plan-back")) {
    link.addEventListener("click", () => track("add_to_calendar_cancelled"));
}

// [3] -> "dinner", [2, 3] -> "lunch and dinner"
function slotNames(slots) {
    return slots.map((slot) => (MEAL_SLOTS[slot] || `meal ${slot}`).toLowerCase()).join(" and ");
}

// The recipe is already on this day. Resolves true only if the user chooses
// to add it again; a repeat in the same meal can't be added, so that only
// gets an OK button.
function askAboutDuplicate(recipeTitle, plannedSlots, slot) {
    const title = document.createElement("strong");
    title.textContent = recipeTitle;
    const day = planBanner.dataset.dayLabel;
    const sameMeal = plannedSlots.includes(slot);

    if (sameMeal) {
        duplicateTitle.textContent = "Already in this meal";
        duplicateText.replaceChildren(title, ` is already planned for ${slotNames([slot])} on ${day}.`);
    } else {
        duplicateTitle.textContent = "Add it again?";
        duplicateText.replaceChildren(title,
            ` is already planned for ${slotNames(plannedSlots)} on ${day}. Add it to ${slotNames([slot])} too?`);
    }
    duplicateAdd.hidden = sameMeal;
    duplicateCancel.textContent = sameMeal ? "OK" : "Cancel";

    duplicateDialog.returnValue = "";
    duplicateDialog.showModal();
    return new Promise((resolve) => {
        duplicateDialog.addEventListener("close", () => {
            resolve(!sameMeal && duplicateDialog.returnValue === "add");
        }, { once: true });
    });
}

// Clicking the dimmed backdrop cancels, like the calendar's popups
duplicateDialog.addEventListener("click", (event) => {
    if (event.target === duplicateDialog) duplicateDialog.close("cancel");
});

function postMeal(date, slot, recipeId, allowDuplicate) {
    return fetch("/api/me/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            date,
            meal_slot: slot,
            recipe_id: recipeId,
            allow_duplicate: allowDuplicate,
            entry_point: "calendar",
        }),
    });
}

async function addToCalendar(button) {
    const date = planBanner.dataset.date;
    const slot = Number(planBanner.dataset.slot);
    const recipeId = Number(button.dataset.recipeId);
    if (!slot) {
        showClientError("Choose a meal above first.", recipeId);
        return;
    }

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    pageError.hidden = true;

    try {
        let response = await postMeal(date, slot, recipeId, false);
        if (response.status === 409) {
            const body = await response.json().catch(() => ({}));
            if (body.code !== "already_planned") {
                throw new Error(body.error || "Couldn't add that recipe. Please try again.");
            }
            const addAgain = await askAboutDuplicate(button.dataset.recipeTitle, body.meal_slots || [], slot);
            if (!addAgain) {
                // Saying no to a repeat is a cancel. A repeat in the same meal
                // can't be added at all, and the server logged that as an error.
                if (!(body.meal_slots || []).includes(slot)) {
                    track("add_to_calendar_cancelled", { recipe_id: recipeId });
                }
                button.disabled = false;
                button.removeAttribute("aria-busy");
                button.focus();
                return;
            }
            response = await postMeal(date, slot, recipeId, true);
        }
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "Couldn't add that recipe. Please try again.");
        }
        location.href = `/calendar?date=${encodeURIComponent(date)}`;
    } catch (error) {
        if (error instanceof TypeError) {
            showClientError("Couldn't reach the server. Please try again.", recipeId);
        } else {
            showError(error.message);
        }
        button.disabled = false;
        button.removeAttribute("aria-busy");
    }
}

document.querySelector(".recipe-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-calendar");
    if (button) addToCalendar(button);
});
