// Only loaded when the page came from a calendar + button (/search?date=…&slot=…).
// "Add to dinner" etc. saves the recipe to that day and meal, then goes back
// to the calendar on that day.

// Saves to /api/me/calendar: the server knows who is logged in, so no user id is sent.
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

// Each option's value is the /search link for that meal
slotSelect.addEventListener("change", () => {
    if (slotSelect.value) location.href = slotSelect.value;
});

function showError(message) {
    pageErrorMessage.textContent = message;
    pageError.hidden = false;
    pageError.scrollIntoView({ behavior: "smooth", block: "center" });
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
        }),
    });
}

async function addToCalendar(button) {
    const date = planBanner.dataset.date;
    const slot = Number(planBanner.dataset.slot);
    if (!slot) {
        showError("Choose a meal above first.");
        return;
    }
    const recipeId = Number(button.dataset.recipeId);

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
        showError(error instanceof TypeError ? "Couldn't reach the server. Please try again." : error.message);
        button.disabled = false;
        button.removeAttribute("aria-busy");
    }
}

document.querySelector(".recipe-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest(".add-to-calendar");
    if (button) addToCalendar(button);
});
