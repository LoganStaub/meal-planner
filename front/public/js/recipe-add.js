// "Add your own recipe" on the Recipes page.
//
// 1. The user types or pastes a recipe.
// 2. POST …/recipe-assistant/check: the AI checks it is a real recipe and
//    fits it to our database (meal type, units, time, cost, macros).
// 3. The user reviews the result, corrects the name, meal type, time, cost
//    or ingredients if needed (no new AI check), and presses Save.
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

    function input(type, value, attributes = {}) {
        const element = document.createElement("input");
        element.type = type;
        for (const [name, attribute] of Object.entries(attributes)) element.setAttribute(name, attribute);
        element.value = value;
        return element;
    }

    function select(options, value, label) {
        const element = document.createElement("select");
        if (label) element.setAttribute("aria-label", label);
        for (const option of options) element.append(new Option(option, option));
        element.value = value;
        return element;
    }

    // A small label above a form control
    function field(labelText, control) {
        const label = el("label", "recipe-add-field");
        label.append(el("span", "recipe-add-field-label", labelText), control);
        return label;
    }

    // One editable ingredient: amount, unit, name, and a button to remove it.
    // "New" marks a name we don't have yet, so a near-duplicate is easy to spot.
    function ingredientRow(item, measurements, knownNames) {
        const row = el("li");
        const amount = input("text", item.amount, { maxlength: 20, "aria-label": "Amount" });
        amount.className = "recipe-add-amount";
        const name = input("text", item.name, {
            maxlength: 60, "aria-label": "Ingredient", list: "recipe-add-ingredient-names",
        });
        name.className = "recipe-add-name";

        const newTag = el("span", "recipe-add-new", "New");
        newTag.title = "Not in the ingredient list yet";
        const updateNewTag = () => {
            const typed = name.value.trim().toLowerCase();
            newTag.hidden = !typed || knownNames.has(typed);
        };
        name.addEventListener("input", updateNewTag);
        updateNewTag();

        const remove = el("button", "recipe-add-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${item.name}`);
        remove.addEventListener("click", () => row.remove());

        row.append(amount, select(measurements, item.measurement, "Unit"), name, newTag, remove);
        return row;
    }

    // The fields the user can correct before saving; readEdits() collects them
    let editor = null;

    // body = the answer from …/check: the recipe plus the lists for the dropdowns
    function renderPreview(body) {
        const { recipe } = body;
        const knownNames = new Set((body.ingredient_names ?? []).map((name) => name.toLowerCase()));

        editor = {
            title: input("text", recipe.title, { maxlength: 80 }),
            mealClass: select(body.meal_classes ?? [recipe.meal_class], recipe.meal_class),
            prepTime: input("number", recipe.prep_time, { min: 1, max: 1440, step: 1 }),
            cost: input("number", recipe.cost.toFixed(2), { min: 0, max: 500, step: 0.01 }),
            ingredients: el("ul", "recipe-add-ingredients"),
        };

        const facts = el("div", "recipe-add-fields");
        facts.append(
            field("Meal type", editor.mealClass),
            field("Minutes", editor.prepTime),
            field("Cost ($)", editor.cost),
        );

        const measurements = body.measurements ?? [];
        for (const item of recipe.ingredients) {
            editor.ingredients.append(ingredientRow(item, measurements, knownNames));
        }
        // Typing in an ingredient name suggests the ones we already have
        const suggestions = document.createElement("datalist");
        suggestions.id = "recipe-add-ingredient-names";
        for (const name of body.ingredient_names ?? []) suggestions.append(new Option(name, name));

        const method = el("ol", "recipe-add-steps");
        for (const step of recipe.steps) method.append(el("li", "", step));

        preview.replaceChildren(
            field("Recipe name", editor.title),
            facts,
            el("p", "recipe-add-macros", recipe.macros),
            el("h4", "", "Ingredients"),
            editor.ingredients,
            suggestions,
            el("h4", "", "Steps"),
            method,
        );
        if (recipe.notes) preview.append(el("p", "recipe-add-notes", recipe.notes));
    }

    // What the user left in the preview. The server re-checks every field.
    function readEdits() {
        return {
            title: editor.title.value,
            meal_class: editor.mealClass.value,
            prep_time: Number(editor.prepTime.value),
            cost: Number(editor.cost.value),
            ingredients: [...editor.ingredients.children].map((row) => ({
                amount: row.querySelector(".recipe-add-amount").value,
                measurement: row.querySelector("select").value,
                name: row.querySelector(".recipe-add-name").value,
            })),
        };
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
            renderPreview(body);
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

        const { ok, status, body } = await post(
            `/drafts/${encodeURIComponent(draftId)}/save`, { recipe: readEdits() });
        saveButton.disabled = false;
        editButton.disabled = false;
        showRemaining(body);

        if (status === 401) return;
        if (ok) {
            savedSomething = true;
            textarea.value = "";
            updateCounter();
            doneText.replaceChildren(el("strong", "", body.recipe_title), " is now in the recipe list.");
            doneLink.href = `/recipes?q=${encodeURIComponent(body.recipe_title)}`;
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
