// Meals load from /api/me/calendar: the server knows who is logged in from
// the session cookie, so the page never sends a user id.
// Same numbers as calendar.meal_slot (see back/db/schema.sql)
const MEAL_SLOTS = { 1: "Breakfast", 2: "Lunch", 3: "Dinner", 4: "Snack", 5: "Dessert" };
// The three main meals get their own column; the rest share "Snacks & desserts"
const PRIMARY_SLOTS = [1, 2, 3];
const EXTRA_SLOTS = [4, 5];

// Links out to teammates' pages. Change the URLs here if theirs change.
// Search adds the recipe, then redirects back to /calendar?date=YYYY-MM-DD
// Search starts on that meal's filter (e.g. Breakfast) unless filter is
// sent empty; the general + button does that so it shows every recipe.
function searchUrl(date, slot, { unfiltered = false } = {}) {
    const params = new URLSearchParams({ date });
    if (slot) params.set("slot", slot);
    if (unfiltered) params.set("filter", "");
    return `/search?${params}`;
}

function recipeUrl(recipeId) {
    return `/recipe?id=${encodeURIComponent(recipeId)}`;
}

// Heading for a day with meals (and while loading)
const DEFAULT_HEADING = "What's cooking";
// A day with nothing planned gets one of these instead
const EMPTY_DAY_HEADINGS = [
    "What's cookin', good lookin'?",
    "Nothing's cookin' yet",
    "This plate's looking clean",
    "Empty fridge energy",
    "Let's get this bread",
    "Hungry? Same.",
    "Don't go bacon my heart",
    "Lettuce plan something",
    "Feeling snack-ish?",
    "A blank plate, full of potential",
];

// The same day always gets the same phrase, so it doesn't change every
// time the page redraws (e.g. after removing the day's last meal)
function emptyDayHeading(dateKey) {
    let hash = 0;
    for (const char of dateKey) hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
    return EMPTY_DAY_HEADINGS[hash % EMPTY_DAY_HEADINGS.length];
}

const weekDays = document.getElementById("week-days");
const weekRange = document.getElementById("week-range");
const weekRelative = document.getElementById("week-relative");
const selectedDateLabel = document.getElementById("selected-date");
const selectedDaySection = document.getElementById("selected-day");
const mealList = document.getElementById("meal-list");
const selectedHeading = document.getElementById("selected-heading");
const addMealLink = document.getElementById("add-meal");
const findRecipeLink = document.getElementById("find-recipe");
const pageError = document.getElementById("page-error");
const pageErrorMessage = document.getElementById("page-error-message");
const pageErrorRetry = document.getElementById("page-error-retry");
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

// "YYYY-MM-DD" -> local Date, or null if it isn't a real day
function parseDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day);
    const isRealDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return isRealDay ? date : null;
}

// /calendar?date=YYYY-MM-DD opens on that day (search redirects here after saving)
const selectedDate = parseDateKey(new URLSearchParams(location.search).get("date")) || new Date();

// Meals for the visible week, keyed by "YYYY-MM-DD"
let weekMeals = new Map();
let loadedWeekStart = null;
let weekStatus = "loading"; // "loading" | "ready" | "error"
let latestRequest = 0;

function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getWeekBounds(date) {
    const sunday = new Date(date);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const saturday = new Date(sunday);
    saturday.setDate(saturday.getDate() + 6);
    return { sunday, saturday };
}

function showError(message, { retry = false } = {}) {
    pageErrorMessage.textContent = message;
    pageErrorRetry.hidden = !retry;
    pageError.hidden = false;
}

function clearError() {
    pageError.hidden = true;
}

// Loads the visible week with one request, unless it's already loaded
async function loadWeek() {
    const { sunday, saturday } = getWeekBounds(selectedDate);
    const start = getLocalDateKey(sunday);
    if (start === loadedWeekStart) return;

    loadedWeekStart = start;
    weekMeals = new Map();
    weekStatus = "loading";
    renderCalendar();

    // Ignore responses for a week the user has already moved past
    const requestId = ++latestRequest;
    const params = new URLSearchParams({ start, end: getLocalDateKey(saturday) });
    try {
        const response = await fetch(`/api/me/calendar?${params}`);
        if (!response.ok) throw new Error(await response.text());
        const rows = await response.json();
        if (requestId !== latestRequest) return;

        for (const row of rows) {
            if (!weekMeals.has(row.date)) weekMeals.set(row.date, []);
            weekMeals.get(row.date).push(row);
        }
        weekStatus = "ready";
        clearError();
    } catch (error) {
        if (requestId !== latestRequest) return;
        console.error("Error loading meal plan:", error);
        weekStatus = "error";
        // Let Try again, the next day click, or a week change load it again
        loadedWeekStart = null;
        showError("Couldn't load your meal plan.", { retry: true });
    }
    renderCalendar();
}

const confirmRemoveDialog = document.getElementById("confirm-remove");
const confirmRemoveText = document.getElementById("confirm-remove-text");

// Opens the on-page confirmation. Resolves true only if Remove was clicked;
// Cancel, Esc, and clicking the backdrop all resolve false.
function askToRemove(meal) {
    const slotName = (MEAL_SLOTS[meal.meal_slot] || `meal ${meal.meal_slot}`).toLowerCase();
    const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" })
        .format(parseDateKey(meal.date));
    const title = document.createElement("strong");
    title.textContent = meal.recipe_title;
    confirmRemoveText.replaceChildren(title, ` will be removed from ${slotName} on ${day}.`);

    confirmRemoveDialog.returnValue = "";
    confirmRemoveDialog.showModal();
    return new Promise((resolve) => {
        confirmRemoveDialog.addEventListener("close", () => {
            resolve(confirmRemoveDialog.returnValue === "remove");
        }, { once: true });
    });
}

confirmRemoveDialog.addEventListener("click", (event) => {
    if (event.target === confirmRemoveDialog) confirmRemoveDialog.close("cancel");
});

async function removeMeal(meal, button) {
    if (!(await askToRemove(meal))) return;

    button.disabled = true;
    try {
        const response = await fetch(`/api/me/calendar/${meal.calendar_id}`, {
            method: "DELETE"
        });
        // 404 means it's already gone, which is what we wanted anyway
        if (!response.ok && response.status !== 404) throw new Error(await response.text());
    } catch (error) {
        console.error("Error removing meal:", error);
        showError(`Couldn't remove ${meal.recipe_title}. Please try again.`);
        button.disabled = false;
        return;
    }

    const remaining = (weekMeals.get(meal.date) || []).filter((m) => m.calendar_id !== meal.calendar_id);
    if (remaining.length > 0) {
        weekMeals.set(meal.date, remaining);
    } else {
        weekMeals.delete(meal.date);
    }
    clearError();
    renderCalendar();
    // The card that had focus is gone, so keep keyboard users nearby
    addMealLink.focus();
}

// One dish. The slot label ("Snack") only shows where the group heading
// doesn't already say it.
function createMealCard(meal, { showSlot = false } = {}) {
    const slotName = MEAL_SLOTS[meal.meal_slot] || `Meal ${meal.meal_slot}`;
    const item = document.createElement("li");
    item.className = "meal-card";
    const link = document.createElement("a");
    link.className = "meal-link";
    link.href = recipeUrl(meal.recipe_id);
    if (showSlot) {
        const slot = document.createElement("span");
        slot.className = "meal-slot";
        slot.textContent = slotName;
        link.append(slot);
    }
    const title = document.createElement("span");
    title.className = "meal-title";
    title.textContent = meal.recipe_title;
    link.append(title);

    // A sibling of the link (not inside it), so clicking it never opens the recipe
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "meal-remove";
    remove.setAttribute("aria-label", `Remove ${meal.recipe_title} from ${slotName.toLowerCase()}`);
    remove.innerHTML = '<svg class="icon"><use href="#icon-x"/></svg>';
    remove.addEventListener("click", () => removeMeal(meal, remove));

    item.append(link, remove);
    return item;
}

// "+ Add lunch" etc. for a main meal with no dishes yet
function createMealPlaceholder(dateKey, slotNumber, slotName) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "meal-placeholder";
    link.href = searchUrl(dateKey, slotNumber);
    link.innerHTML = '<svg class="icon"><use href="#icon-plus"/></svg>';
    link.append(`Add ${slotName.toLowerCase()}`);
    item.append(link);
    return item;
}

// Heading row for a group: "DINNER" plus an optional link on the right
function createGroupHeader(id, text, action) {
    const header = document.createElement("div");
    header.className = "meal-group-header";
    const heading = document.createElement("h3");
    heading.className = "meal-group-title";
    heading.id = id;
    heading.textContent = text;
    header.append(heading);
    if (action) header.append(action);
    return header;
}

function createAddLink(className, href, text, label) {
    const link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.innerHTML = '<svg class="icon"><use href="#icon-plus"/></svg>';
    link.append(text);
    if (label) link.setAttribute("aria-label", label);
    return link;
}

// Breakfast, Lunch or Dinner: every dish in it, or a placeholder if it's empty
function createMealGroup(dateKey, slotNumber, meals) {
    const slotName = MEAL_SLOTS[slotNumber];
    const group = document.createElement("section");
    group.className = "meal-group";
    group.setAttribute("aria-labelledby", `meal-group-${slotNumber}`);

    const addAnother = meals.length > 0
        ? createAddLink("meal-group-add", searchUrl(dateKey, slotNumber), "Add another",
            `Add another ${slotName.toLowerCase()} dish`)
        : null;

    const list = document.createElement("ul");
    list.className = "meal-group-list";
    if (meals.length > 0) {
        for (const meal of meals) list.append(createMealCard(meal));
    } else {
        list.append(createMealPlaceholder(dateKey, slotNumber, slotName));
    }

    group.append(createGroupHeader(`meal-group-${slotNumber}`, slotName, addAnother), list);
    return group;
}

// Snacks, desserts (and any slot number we don't have a name for)
function createExtrasGroup(dateKey, meals) {
    const group = document.createElement("section");
    group.className = "meal-group meal-extras";
    group.setAttribute("aria-labelledby", "meal-group-extras");
    group.append(createGroupHeader("meal-group-extras", "Snacks & desserts"));

    if (meals.length > 0) {
        const list = document.createElement("ul");
        list.className = "meal-group-list";
        for (const meal of meals) list.append(createMealCard(meal, { showSlot: true }));
        group.append(list);
    }

    const addRow = document.createElement("div");
    addRow.className = "extra-add-row";
    for (const slotNumber of EXTRA_SLOTS) {
        const slotName = MEAL_SLOTS[slotNumber];
        addRow.append(createAddLink("extra-add", searchUrl(dateKey, slotNumber), slotName,
            `Add a ${slotName.toLowerCase()}`));
    }
    group.append(addRow);
    return group;
}

function renderSelectedDay() {
    const dateKey = getLocalDateKey(selectedDate);
    const meals = weekMeals.get(dateKey) || [];

    const primary = document.createElement("div");
    primary.className = "meal-primary";
    let firstEmptySlot = null;
    for (const slotNumber of PRIMARY_SLOTS) {
        const slotMeals = meals.filter((m) => m.meal_slot === slotNumber);
        if (slotMeals.length === 0 && firstEmptySlot === null) firstEmptySlot = slotNumber;
        primary.append(createMealGroup(dateKey, slotNumber, slotMeals));
    }
    const extras = meals.filter((m) => !PRIMARY_SLOTS.includes(m.meal_slot));
    mealList.replaceChildren(primary, createExtrasGroup(dateKey, extras));

    // + goes to the first empty main meal, or just the day (search then
    // asks which meal) once breakfast, lunch and dinner all have something
    // Both are general "add something" links, so search opens unfiltered
    addMealLink.href = searchUrl(dateKey, firstEmptySlot, { unfiltered: true });
    addMealLink.setAttribute("aria-label", firstEmptySlot
        ? `Add ${MEAL_SLOTS[firstEmptySlot].toLowerCase()}`
        : "Add a meal");
    findRecipeLink.href = searchUrl(dateKey, firstEmptySlot, { unfiltered: true });

    selectedDaySection.dataset.state = weekStatus === "ready"
        ? (meals.length > 0 ? "filled" : "empty")
        : weekStatus;
    selectedHeading.textContent = selectedDaySection.dataset.state === "empty"
        ? emptyDayHeading(dateKey)
        : DEFAULT_HEADING;
}

function renderCalendar() {
    const { sunday, saturday } = getWeekBounds(selectedDate);

    const sameMonth = sunday.getMonth() === saturday.getMonth();
    weekRange.textContent = sameMonth
        ? `${new Intl.DateTimeFormat("en-US", { month: "long" }).format(sunday)} ${sunday.getDate()}–${saturday.getDate()}`
        : `${dateFormatter.format(sunday)}–${dateFormatter.format(saturday)}`;
    const today = new Date();
    const currentSunday = new Date(today);
    currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());
    currentSunday.setHours(0, 0, 0, 0);
    const weekOffset = Math.round((sunday - currentSunday) / (7 * 24 * 60 * 60 * 1000));
    weekRelative.textContent = weekOffset === 0
        ? "This week"
        : weekOffset === 1
            ? "Next week"
            : weekOffset === -1
                ? "Last week"
                : `Week of ${dateFormatter.format(sunday)}`;

    weekDays.replaceChildren();
    for (let index = 0; index < 7; index += 1) {
        const date = new Date(sunday);
        date.setDate(sunday.getDate() + index);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "day-button";
        button.setAttribute("aria-pressed", getLocalDateKey(date) === getLocalDateKey(selectedDate) ? "true" : "false");
        const hasMeals = weekMeals.has(getLocalDateKey(date));
        const dayLabel = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric"
        }).format(date);
        button.setAttribute("aria-label", hasMeals ? `${dayLabel}, meals planned` : dayLabel);

        const dayName = document.createElement("span");
        dayName.className = "day-name";
        dayName.textContent = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
        const dayNumber = document.createElement("span");
        dayNumber.className = "day-number";
        dayNumber.textContent = String(date.getDate());
        button.append(dayName, dayNumber);
        if (hasMeals) {
            const dot = document.createElement("span");
            dot.className = "day-dot";
            button.append(dot);
        }
        button.addEventListener("click", () => {
            selectedDate.setTime(date.getTime());
            showSelectedDate();
        });
        weekDays.append(button);
    }

    selectedDateLabel.textContent = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "long",
        day: "numeric"
    }).format(selectedDate).toUpperCase();

    renderSelectedDay();
}

// Re-renders right away, then fetches only if the week changed
// (or the last load for this week failed)
function showSelectedDate() {
    renderCalendar();
    loadWeek();
}

document.getElementById("previous-week").addEventListener("click", () => {
    selectedDate.setDate(selectedDate.getDate() - 7);
    showSelectedDate();
});
document.getElementById("next-week").addEventListener("click", () => {
    selectedDate.setDate(selectedDate.getDate() + 7);
    showSelectedDate();
});
pageErrorRetry.addEventListener("click", showSelectedDate);

// ---------- Month view popup ----------
const monthPicker = document.getElementById("month-picker");
const monthTitle = document.getElementById("month-title");
const monthGrid = document.getElementById("month-grid");
const monthStatus = document.getElementById("month-status");
const monthTitleFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const monthDayLabelFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// monthFocus is the day keyboard focus is on; the grid shows its month
let monthFocus = new Date();
let monthMealDates = new Set();
let loadedMonthStart = null;
let latestMonthRequest = 0;

// Always 6 weeks (Sunday before the 1st onward) so the popup doesn't change height
function getMonthGridBounds(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 41);
    return { start, end };
}

// Which days in the grid have meals, with one request per month
async function loadMonth() {
    const { start, end } = getMonthGridBounds(monthFocus);
    const startKey = getLocalDateKey(start);
    if (startKey === loadedMonthStart) return;

    loadedMonthStart = startKey;
    monthMealDates = new Set();
    monthStatus.textContent = "";
    renderMonth();

    const requestId = ++latestMonthRequest;
    const params = new URLSearchParams({ start: startKey, end: getLocalDateKey(end) });
    try {
        const response = await fetch(`/api/me/calendar?${params}`);
        if (!response.ok) throw new Error(await response.text());
        const rows = await response.json();
        if (requestId !== latestMonthRequest) return;
        monthMealDates = new Set(rows.map((row) => row.date));
    } catch (error) {
        if (requestId !== latestMonthRequest) return;
        console.error("Error loading month:", error);
        loadedMonthStart = null;
        monthStatus.textContent = "Couldn't load which days have meals.";
    }
    renderMonth();
}

function renderMonth({ focus = false } = {}) {
    const viewMonth = monthFocus.getMonth();
    monthTitle.textContent = monthTitleFormatter.format(monthFocus);

    const { start } = getMonthGridBounds(monthFocus);
    const todayKey = getLocalDateKey(new Date());
    const selectedKey = getLocalDateKey(selectedDate);
    const focusKey = getLocalDateKey(monthFocus);
    let focusButton = null;

    monthGrid.replaceChildren();
    for (let index = 0; index < 42; index += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const key = getLocalDateKey(date);
        const hasMeals = monthMealDates.has(key);

        const button = document.createElement("button");
        button.type = "button";
        button.className = date.getMonth() === viewMonth ? "month-day" : "month-day is-outside";
        button.textContent = String(date.getDate());
        button.dataset.date = key;
        // Only the focused day is tabbable; arrow keys move between days
        button.tabIndex = key === focusKey ? 0 : -1;
        button.setAttribute("aria-pressed", key === selectedKey ? "true" : "false");
        if (key === todayKey) button.setAttribute("aria-current", "date");
        const label = monthDayLabelFormatter.format(date);
        button.setAttribute("aria-label", hasMeals ? `${label}, meals planned` : label);
        if (hasMeals) {
            const dot = document.createElement("span");
            dot.className = "day-dot";
            button.append(dot);
        }
        if (key === focusKey) focusButton = button;
        monthGrid.append(button);
    }
    if (focus && focusButton) focusButton.focus();
}

function openMonthPicker() {
    monthFocus = new Date(selectedDate);
    // Meals may have changed since last time (removed here, added on search)
    loadedMonthStart = null;
    monthPicker.showModal();
    renderMonth({ focus: true });
    loadMonth();
}

// Jump the page to a day and its week
function pickDate(date) {
    selectedDate.setTime(date.getTime());
    monthPicker.close();
    showSelectedDate();
}

// Moves by whole months, keeping the day number where possible (Jan 31 -> Feb 28)
function changeMonth(offset, options) {
    const day = monthFocus.getDate();
    const target = new Date(monthFocus.getFullYear(), monthFocus.getMonth() + offset, 1);
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, daysInMonth));
    monthFocus = target;
    renderMonth(options);
    loadMonth();
}

function moveFocusByDays(days) {
    monthFocus.setDate(monthFocus.getDate() + days);
    renderMonth({ focus: true });
    loadMonth();
}

monthGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".month-day");
    if (button) pickDate(parseDateKey(button.dataset.date));
});

monthGrid.addEventListener("keydown", (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in moves) {
        moveFocusByDays(moves[event.key]);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
        changeMonth(event.key === "PageUp" ? -1 : 1, { focus: true });
    } else {
        return;
    }
    event.preventDefault();
});

document.getElementById("open-month").addEventListener("click", openMonthPicker);
document.getElementById("previous-month").addEventListener("click", () => changeMonth(-1));
document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
// Shows the current month (popup stays open) with focus on today
document.getElementById("month-today").addEventListener("click", () => {
    monthFocus = new Date();
    renderMonth({ focus: true });
    loadMonth();
});
document.getElementById("close-month").addEventListener("click", () => monthPicker.close());
// Clicking the dimmed backdrop closes it, like the popups on the home page
monthPicker.addEventListener("click", (event) => {
    if (event.target === monthPicker) monthPicker.close();
});

showSelectedDate();
