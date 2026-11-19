// The recipe window and the "Add to calendar" popup, shared by the Home and
// Recipes pages (views/partials/recipe-details.ejs, css/recipe-details.css).
//
// Other scripts on the page can use:
//   RecipeDetails.open(recipeId, { title, description, image_url })
//   PlanDialog.open({ recipe_id, recipe_title, recipe_class_desc })
//
// A link with data-recipe-details="<recipe id>" opens the window when clicked,
// and /recipes?recipe=<id> opens it as soon as the page loads.
//
// The server knows who is logged in (the login session), so no user id is sent.

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

    // ---------- Add to calendar popup ----------
    // Pick a day and a meal, then POST /api/me/calendar.

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

    // On the Recipes page after pressing + on the calendar, the day and meal
    // the user came to fill are in the banner (views/search.ejs)
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
        planSubmit.textContent = "Add to calendar";
        showPlanMessage("");
    }

    function openPlan(recipe) {
        planRecipe = recipe;
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
    }

    async function savePlan() {
        const date = planDate.value;
        const slot = selectedSlot();
        if (!date) { showPlanMessage("Choose a day."); planDate.focus(); return; }
        if (date < planDate.min) { showPlanMessage("Choose today or a later day."); planDate.focus(); return; }
        if (!slot) { showPlanMessage("Choose a meal."); return; }

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
            if (!response.ok) throw new Error(body.error || "Couldn't add it to your calendar. Please try again.");

            document.getElementById("plan-done-text").replaceChildren(
                el("strong", "", planRecipe.recipe_title || "The recipe"),
                ` is on your calendar for ${MEAL_SLOTS[slot].toLowerCase()} on ${formatDay(date)}.`);
            planDoneLink.href = `/calendar?date=${encodeURIComponent(date)}`;
            planChoose.hidden = true;
            planDone.hidden = false;
            planDoneLink.focus();
        } catch (error) {
            showPlanMessage(error instanceof TypeError ? "Couldn't reach the server. Please try again." : error.message);
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

    window.PlanDialog = { open: openPlan };

    // ---------- Recipe window ----------
    // Loads one recipe from GET /api/recipes/:id and shows everything about it.

    const dialog = document.getElementById("recipe-details");
    const titleElement = document.getElementById("details-title");
    const bodyElement = document.getElementById("details-body");
    const actions = document.getElementById("details-actions");
    const likeButton = document.getElementById("details-like");
    const likeText = document.getElementById("details-like-text");

    // The recipe on show, as the server sent it (null while loading)
    let current = null;
    // Counts opens, so a slow answer for an earlier recipe is ignored
    let openCount = 0;

    // 35 -> "35 min", 90 -> "1 hr 30 min"
    function formatTime(minutes) {
        if (minutes < 60) return `${minutes} min`;
        const rest = minutes % 60;
        return rest ? `${Math.floor(minutes / 60)} hr ${rest} min` : `${Math.floor(minutes / 60)} hr`;
    }

    // recipes.macros is one line of text, written by scripts/seedRecipes.js and
    // the AI assistant: "Per serving (serves 4, vegan): 520 kcal | Protein 34g | Carbs 48g | Fat 20g"
    function parseMacros(text) {
        const find = (pattern) => {
            const match = pattern.exec(text || "");
            return match ? Number(match[1]) : null;
        };
        const serves = /\(serves\s+(\d+)([^)]*)\)/i.exec(text || "");
        return {
            servings: serves ? Number(serves[1]) : null,
            // Anything else in the brackets, such as "vegan"
            tags: serves ? serves[2].split(",").map((tag) => tag.trim()).filter(Boolean) : [],
            calories: find(/(\d+)\s*kcal/i),
            protein: find(/protein\s+(\d+)\s*g/i),
            carbs: find(/carbs\s+(\d+)\s*g/i),
            fat: find(/fat\s+(\d+)\s*g/i),
        };
    }

    // Short units read better in a list: "2 tbsp", "1/2 cup"
    const UNITS = { Cup: "cup", Tablespoon: "tbsp", Teaspoon: "tsp", Gram: "g", Ounce: "oz", Pound: "lb" };

    // "Each" is for countable things (2 eggs), so only the number is shown
    function formatAmount(item) {
        const unit = item.measurement_desc === "Each" ? "" : UNITS[item.measurement_desc] ?? item.measurement_desc ?? "";
        return [item.amount, unit].filter(Boolean).join(" ");
    }

    // Same meaning as the Pantry page: 0 plenty, 1 running low, 2 or missing = none
    function pantryStatus(item) {
        if (item.pantry_amount_id === 0) return { className: "have", label: "In pantry" };
        if (item.pantry_amount_id === 1) return { className: "low", label: "Running low" };
        return { className: "buy", label: "To buy" };
    }

    function sectionHeading(title, note) {
        const heading = el("div", "rw-section-heading");
        heading.append(el("h3", "", title));
        if (note) heading.append(el("span", "", note));
        return heading;
    }

    function showLike() {
        const liked = Boolean(current?.liked);
        likeButton.setAttribute("aria-pressed", String(liked));
        likeButton.title = liked ? "Remove from your liked recipes" : "Add to your liked recipes";
        likeText.textContent = liked ? "Liked" : "Like";
    }

    // A message in place of the recipe, with an optional Try again button
    function showStatus(message, retry) {
        const status = el("p", "rw-status", message);
        if (retry) {
            const button = el("button", "plan-btn", "Try again");
            button.type = "button";
            button.addEventListener("click", retry);
            status.append(document.createElement("br"), button);
        }
        bodyElement.replaceChildren(status);
    }

    // extra = what the page already knows that the database doesn't hold yet
    // (the home page's photo and description)
    function render(recipe, extra) {
        const macros = parseMacros(recipe.macros);
        const parts = [];

        if (extra.image_url) {
            const photo = el("img", "rw-photo");
            photo.alt = "";
            photo.addEventListener("error", () => photo.remove());
            photo.src = extra.image_url;
            parts.push(photo);
        }
        if (extra.description) parts.push(el("p", "rw-description", extra.description));

        const facts = el("ul", "rw-facts");
        const addFact = (text) => facts.append(el("li", "", text));
        if (recipe.prep_time) addFact(formatTime(Math.round(recipe.prep_time)));
        if (recipe.recipe_class_desc) addFact(recipe.recipe_class_desc);
        if (macros.servings) addFact(`Serves ${macros.servings}`);
        for (const tag of macros.tags) addFact(tag.charAt(0).toUpperCase() + tag.slice(1));
        if (typeof recipe.cost === "number") {
            const perServing = macros.servings > 1 ? ` ($${(recipe.cost / macros.servings).toFixed(2)} a serving)` : "";
            addFact(`About $${recipe.cost.toFixed(2)}${perServing}`);
        }
        if (facts.children.length > 0) parts.push(facts);

        // Macros
        const numbers = [
            [macros.calories, "", "Calories"],
            [macros.protein, "g", "Protein"],
            [macros.carbs, "g", "Carbs"],
            [macros.fat, "g", "Fat"],
        ].filter(([value]) => value !== null);
        if (numbers.length > 0) {
            const tiles = el("div", "rw-macros");
            for (const [value, unit, label] of numbers) {
                const tile = el("div");
                tile.append(el("strong", "", `${value}${unit}`), el("span", "", label));
                tiles.append(tile);
            }
            parts.push(sectionHeading("Macros", "Per serving"), tiles);
        } else if (recipe.macros) {
            parts.push(sectionHeading("Macros"), el("p", "rw-plain", recipe.macros));
        }

        // Ingredients, each with whether this user has it
        const ingredients = recipe.recipe_ingredients || [];
        if (ingredients.length > 0) {
            const list = el("ul", "rw-ingredients");
            let toBuy = 0;
            for (const item of ingredients) {
                const status = pantryStatus(item);
                if (status.className === "buy") toBuy += 1;
                const row = el("li");
                row.append(
                    el("span", "rw-amount", formatAmount(item)),
                    el("span", "rw-name", item.ingredient_name),
                    el("span", `rw-pantry ${status.className}`, status.label),
                );
                list.append(row);
            }
            const note = toBuy === 0 ? "You have everything" : `${ingredients.length - toBuy} in pantry · ${toBuy} to buy`;
            parts.push(sectionHeading("Ingredients", note), list);
        } else {
            parts.push(sectionHeading("Ingredients"), el("p", "rw-plain", "No ingredients are listed for this recipe yet."));
        }

        // Steps: one per line in recipes.instructions, saved as "1. Do this"
        const steps = (recipe.instructions || "").split(/\r?\n/)
            .map((line) => line.trim().replace(/^\d+[.)]\s+/, ""))
            .filter(Boolean);
        if (steps.length > 0) {
            const list = el("ol", "rw-steps");
            for (const step of steps) list.append(el("li", "", step));
            parts.push(sectionHeading("Steps"), list);
        }

        if (recipe.added_by) parts.push(el("p", "rw-added-by", `Added by ${recipe.added_by}`));

        titleElement.textContent = recipe.recipe_title;
        bodyElement.replaceChildren(...parts);
        bodyElement.scrollTop = 0;
        showLike();
        actions.hidden = false;
    }

    async function openRecipe(recipeId, extra = {}) {
        const thisOpen = ++openCount;
        current = null;
        titleElement.textContent = extra.title || "Recipe";
        actions.hidden = true;
        showStatus("Loading recipe…");
        if (!dialog.open) dialog.showModal();

        const retry = () => openRecipe(recipeId, extra);
        let response;
        try {
            response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`);
        } catch {
            if (thisOpen === openCount) showStatus("Couldn't reach the server.", retry);
            return;
        }
        if (thisOpen !== openCount) return;

        if (response.status === 401) {
            goToLogin();
            return;
        }
        if (response.status === 404 || response.status === 400) {
            showStatus("This recipe isn't available any more.");
            return;
        }
        const recipe = response.ok ? await response.json().catch(() => null) : null;
        if (thisOpen !== openCount) return;
        if (!recipe) {
            showStatus("Couldn't load this recipe.", retry);
            return;
        }
        current = recipe;
        render(recipe, extra);
    }

    // Likes are saved per user: PUT likes a recipe, DELETE unlikes it.
    // The button flips right away, and flips back if saving fails.
    likeButton.addEventListener("click", async () => {
        const recipe = current;
        if (!recipe) return;
        const liked = !recipe.liked;

        const setLiked = (value) => {
            recipe.liked = value;
            if (current === recipe) showLike();
            // Lets the page keep its own heart in step (js/index.js listens)
            document.dispatchEvent(new CustomEvent("recipe-like-change", {
                detail: { recipe_id: recipe.recipe_id, liked: value },
            }));
        };

        setLiked(liked);
        try {
            const response = await fetch(`/api/me/likes/${encodeURIComponent(recipe.recipe_id)}`, {
                method: liked ? "PUT" : "DELETE",
            });
            if (response.status === 401) {
                goToLogin();
                return;
            }
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
        } catch (error) {
            console.error("Could not save like:", error);
            setLiked(!liked);
        }
    });

    document.getElementById("details-calendar").addEventListener("click", () => {
        if (current) openPlan(current);
    });

    document.getElementById("close-details").addEventListener("click", () => dialog.close());
    // Clicking the dimmed background closes the window
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });

    // Links such as the recipe cards on the Recipes page
    document.addEventListener("click", (event) => {
        const link = event.target.closest?.("[data-recipe-details]");
        if (!link) return;
        // Ctrl/Cmd/Shift-click and middle-click still open the link in a new tab
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openRecipe(link.dataset.recipeDetails, { title: link.dataset.recipeTitle || link.textContent.trim() });
    });

    // /recipes?recipe=3 (where /recipe?id=3 from the calendar ends up): open
    // that recipe now, and tidy the address when the window closes
    const fromAddress = new URLSearchParams(location.search).get("recipe");
    if (fromAddress && /^\d+$/.test(fromAddress)) {
        openRecipe(fromAddress);
        dialog.addEventListener("close", () => {
            const url = new URL(location.href);
            url.searchParams.delete("recipe");
            history.replaceState(null, "", url);
        }, { once: true });
    }

    window.RecipeDetails = { open: openRecipe };
})();
