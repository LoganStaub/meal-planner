
        // The home page only ever shows this many meals at a time
        const MAX_MEALS = 5;

        // "Tonight's picks" changes with the time of day, using the visitor's
        // own clock (the server might be in another time zone)
        function picksTimeOfDay(date = new Date()) {
            const hour = date.getHours();
            if (hour >= 4 && hour < 11) return "this morning's";
            if (hour >= 11 && hour < 17) return "this afternoon's";
            return "tonight's";
        }

        function showPicksTimeOfDay() {
            const when = picksTimeOfDay();
            document.getElementById("picks-label").textContent =
                `${when.charAt(0).toUpperCase()}${when.slice(1)} picks`;
            document.getElementById("done-picks-when").textContent = when;
        }
        showPicksTimeOfDay();

        // Placeholder meals until this page loads from GET /api/recipes.
        // recipe_title, prep_time and recipe_class_desc match the database.
        // recipe_id is only a guess: LoadRecipeData() swaps in the real id by
        // matching the title (npm run db:seed-recipes adds these 5 recipes).
        // description, servings, image_url and the pantry fields don't exist in the schema yet.
        const SAMPLE_MEALS = [
            {
                recipe_id: 1,
                recipe_title: "Smoky chicken & red onion flatbread",
                description: "Crisp-edged flatbread with roasted chicken, sweet red onion and melted mozzarella, finished with fresh herbs.",
                prep_time: 35,
                recipe_class_desc: "Dinner",
                servings: 4,
                image_url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=80&auto=format&fit=crop",
                in_pantry: ["flour", "onion", "mozzarella"],
                to_buy: 2
            },
            {
                recipe_id: 2,
                recipe_title: "Basil pesto farfalle with cherry tomatoes",
                description: "Bow-tie pasta tossed in bright basil pesto with burst cherry tomatoes and a handful of greens.",
                prep_time: 20,
                recipe_class_desc: "Lunch",
                servings: 2,
                image_url: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=1200&q=80&auto=format&fit=crop",
                in_pantry: ["pasta", "basil", "olive oil"],
                to_buy: 1
            },
            {
                recipe_id: 3,
                recipe_title: "Salmon poke bowl",
                description: "Seared salmon over rice with cucumber, corn, red cabbage and a soft-boiled egg.",
                prep_time: 25,
                recipe_class_desc: "Dinner",
                servings: 2,
                image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200&q=80&auto=format&fit=crop",
                in_pantry: ["rice", "eggs", "soy sauce"],
                to_buy: 3
            },
            {
                recipe_id: 4,
                recipe_title: "Rainbow chickpea Buddha bowl",
                description: "Roasted sweet potato, crispy chickpeas, avocado and crunchy veggies with a lemon-tahini drizzle.",
                prep_time: 30,
                recipe_class_desc: "Vegan",
                servings: 2,
                image_url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80&auto=format&fit=crop",
                in_pantry: ["chickpeas", "sweet potato", "lemon"],
                to_buy: 2
            },
            {
                recipe_id: 5,
                recipe_title: "Brioche French toast with berries",
                description: "Thick-cut brioche soaked in vanilla custard, pan-fried golden and topped with banana and blueberries.",
                prep_time: 15,
                recipe_class_desc: "Breakfast",
                servings: 2,
                image_url: "https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=1200&q=80&auto=format&fit=crop",
                in_pantry: ["eggs", "milk", "cinnamon"],
                to_buy: 2
            }
        ];

        const meals = SAMPLE_MEALS.slice(0, MAX_MEALS);
        let nCurrent = 0;
        // true once LoadRecipeData() has the real ids, likes and ratings
        let bRecipesLoaded = false;
        let bAnimating = false;

        const obj_stage = document.getElementById("stage");
        const obj_slide = document.getElementById("slide");
        const obj_photo = document.getElementById("meal-photo");
        const obj_done = document.getElementById("done");
        const obj_progress = document.getElementById("progress");
        const obj_like = document.getElementById("like-btn");
        // The shared profile menu (partials/profile-menu.ejs, js/profile-menu.js)
        const obj_profileMenu = document.getElementById("profile-menu");
        const obj_prevArrow = document.getElementById("prev-arrow");
        const obj_nextArrow = document.getElementById("next-arrow");

        const bReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;


        // one progress bar segment per meal
        meals.forEach(function() {
            obj_progress.appendChild(document.createElement("span"));
        });

        // start downloading every photo now so swiping doesn't wait on them
        meals.forEach(function(meal) {
            new Image().src = meal.image_url;
        });

        // if a photo can't load, hide it and let the slide's gradient background show
        obj_photo.addEventListener("error", function() { obj_photo.classList.add("broken"); });
        obj_photo.addEventListener("load", function() { obj_photo.classList.remove("broken"); });


        // fills the card with the current meal's data
        function RenderMeal() {
            const meal = meals[nCurrent];

            obj_photo.src = meal.image_url;
            obj_photo.alt = meal.recipe_title;
            document.getElementById("meal-time").textContent = `${meal.prep_time} min`;
            document.getElementById("meal-tag").textContent = meal.recipe_class_desc;
            document.getElementById("meal-servings").textContent = `${meal.servings} servings`;
            document.getElementById("meal-title").textContent = meal.recipe_title;
            document.getElementById("meal-desc").textContent = meal.description;
            document.getElementById("meal-pantry").textContent = meal.in_pantry.join(", ");
            document.getElementById("meal-buy").textContent = meal.to_buy > 0 ? `+${meal.to_buy} to buy` : "";

            RenderLike();
            RenderRating();
            RenderSavePrompt();
            RenderProgress(nCurrent + 1);
        }

        // fills the progress bars up to the current meal, and shows "2 of 5"
        function RenderProgress(nShown) {
            [...obj_progress.children].forEach(function(obj_bar, i) {
                obj_bar.classList.toggle("filled", i < nShown);
            });
            document.getElementById("picks-count").textContent = `${Math.min(nShown, meals.length)} of ${meals.length}`;

            // nothing before the first meal, nothing after the "all caught up" screen
            obj_prevArrow.disabled = nShown <= 1;
            obj_nextArrow.disabled = !obj_done.hidden;
        }

        // true once this meal is matched to a real recipe in the database
        function HasRealRecipe(meal) {
            return bRecipesLoaded && meal.recipe_id != null;
        }

        function RenderLike() {
            const meal = meals[nCurrent];
            obj_like.setAttribute("aria-pressed", String(Boolean(meal.liked)));
            // a sample meal that isn't in the database yet can't be liked or planned
            const bMissing = bRecipesLoaded && meal.recipe_id == null;
            const sMissing = bMissing ? "This recipe isn't in the database yet" : "";
            obj_like.disabled = bMissing;
            obj_like.title = sMissing;
            const obj_calendar = document.getElementById("calendar-btn");
            obj_calendar.disabled = bMissing;
            obj_calendar.title = sMissing;
        }

        // The recipe's average rating from everyone, e.g. "★ 4.3 (12)".
        // Hidden until GET /api/recipes answers, so it doesn't flash "No ratings yet".
        function RenderRating() {
            const meal = meals[nCurrent];
            const obj_wrap = document.getElementById("meal-rating-wrap");
            const obj_rating = document.getElementById("meal-rating");
            obj_wrap.hidden = !bRecipesLoaded;
            if (!bRecipesLoaded) return;

            if (meal.rating_count > 0) {
                const average = meal.rating_avg.toFixed(1);
                const ratings = `${meal.rating_count} rating${meal.rating_count === 1 ? "" : "s"}`;
                obj_rating.innerHTML = `<span class="star" aria-hidden="true">★</span> ${average} (${meal.rating_count})`;
                obj_rating.setAttribute("aria-label", `Rated ${average} out of 5 from ${ratings}`);
            } else {
                obj_rating.textContent = "No ratings yet";
                obj_rating.removeAttribute("aria-label");
            }
        }


        // moves to the next (+1) or previous (-1) meal with a slide animation.
        // nFromX is where the card was dragged to, so the animation continues from there.
        async function GoTo(nDirection, nFromX = 0) {
            if (bAnimating || !obj_profileMenu.hidden || obj_plan.open) return;

            // from the "all caught up" screen, going back shows the last meal again
            if (!obj_done.hidden) {
                if (nDirection === -1) {
                    obj_done.hidden = true;
                    RenderMeal();
                    await SlideIn(-1);
                }
                return;
            }

            const nTarget = nCurrent + nDirection;
            if (nTarget < 0) {
                SnapBack(nFromX);
                return;
            }

            bAnimating = true;
            await SlideOut(nDirection, nFromX);

            if (nTarget >= meals.length) {
                obj_done.hidden = false;
                RenderProgress(meals.length);
                obj_slide.style.transform = "";
                obj_slide.style.opacity = "";
                bAnimating = false;
                return;
            }

            nCurrent = nTarget;
            RenderMeal();
            await SlideIn(nDirection);
            bAnimating = false;
        }

        function SlideOut(nDirection, nFromX) {
            const sEnd = `translateX(${-nDirection * obj_stage.clientWidth}px)`;
            const animation = obj_slide.animate(
                [{ transform: `translateX(${nFromX}px)`, opacity: 1 }, { transform: sEnd, opacity: 0 }],
                { duration: bReducedMotion ? 0 : 220, easing: "ease-in" }
            );
            // keep the card off-screen once the animation ends
            obj_slide.style.transform = sEnd;
            obj_slide.style.opacity = "0";
            return animation.finished;
        }

        function SlideIn(nDirection) {
            obj_slide.style.transform = "";
            obj_slide.style.opacity = "";
            return obj_slide.animate(
                [{ transform: `translateX(${nDirection * obj_stage.clientWidth * 0.35}px)`, opacity: 0 },
                 { transform: "translateX(0)", opacity: 1 }],
                { duration: bReducedMotion ? 0 : 260, easing: "ease-out" }
            ).finished;
        }

        // drag wasn't far enough: return the card to the middle
        function SnapBack(nFromX) {
            obj_slide.style.transform = "";
            obj_slide.animate(
                [{ transform: `translateX(${nFromX}px)` }, { transform: "translateX(0)" }],
                { duration: bReducedMotion ? 0 : 200, easing: "ease-out" }
            );
        }


        // ---------- Swiping (touch and mouse) ----------
        let objDrag = null;
        let bSuppressClick = false;

        obj_stage.addEventListener("pointerdown", function(event) {
            if (event.button !== 0 || bAnimating || !obj_done.hidden) return;
            // the action buttons and header are for tapping, not dragging
            if (event.target.closest(".card-actions, .save-prompt, .app-header, .stage-arrows")) return;

            objDrag = { nId: event.pointerId, nStartX: event.clientX, nStartY: event.clientY, nDx: 0, bMoved: false };
        });

        obj_stage.addEventListener("pointermove", function(event) {
            if (!objDrag || event.pointerId !== objDrag.nId) return;

            const nDx = event.clientX - objDrag.nStartX;
            const nDy = event.clientY - objDrag.nStartY;

            // only start dragging once the pointer clearly moves sideways,
            // so taps still open the recipe and vertical scrolling still works
            if (!objDrag.bMoved) {
                if (Math.abs(nDx) < 8 || Math.abs(nDx) < Math.abs(nDy)) return;
                objDrag.bMoved = true;
                obj_stage.setPointerCapture(event.pointerId);
                obj_slide.classList.add("dragging");
            }

            objDrag.nDx = nDx;
            obj_slide.style.transform = `translateX(${nDx}px)`;
        });

        function EndDrag(event) {
            if (!objDrag || event.pointerId !== objDrag.nId) return;
            const { bMoved, nDx } = objDrag;
            objDrag = null;
            if (!bMoved) return;

            obj_slide.classList.remove("dragging");
            bSuppressClick = true;
            setTimeout(function() { bSuppressClick = false; }, 0);

            if (Math.abs(nDx) > obj_stage.clientWidth * 0.2) {
                GoTo(nDx < 0 ? 1 : -1, nDx);
            } else {
                SnapBack(nDx);
            }
        }

        obj_stage.addEventListener("pointerup", EndDrag);
        obj_stage.addEventListener("pointercancel", EndDrag);

        // arrow keys on a computer
        document.addEventListener("keydown", function(event) {
            if (event.key === "ArrowRight") GoTo(1);
            if (event.key === "ArrowLeft") GoTo(-1);
        });


        // ---------- Buttons ----------

        // X skips to the next meal
        document.getElementById("next-btn").addEventListener("click", function() {
            GoTo(1);
        });

        // arrows on a computer
        obj_prevArrow.addEventListener("click", function() { GoTo(-1); });
        obj_nextArrow.addEventListener("click", function() { GoTo(1); });

        // Likes are saved per user: PUT likes a recipe, DELETE unlikes it.
        // The button flips right away, and flips back if saving fails.
        obj_like.addEventListener("click", async function() {
            const meal = meals[nCurrent];
            // wait for the real recipe id, so a like never lands on the wrong recipe
            if (!HasRealRecipe(meal)) return;
            const bLiked = !meal.liked;
            meal.liked = bLiked;
            RenderLike();

            try {
                // ?source=discover: the server logs the save as recipe_saved for OKR 1
                const sQuery = bLiked ? "?source=discover" : "";
                const response = await fetch(`/api/me/likes/${encodeURIComponent(meal.recipe_id)}${sQuery}`, {
                    method: bLiked ? "PUT" : "DELETE"
                });
                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                // ask "Would you actually make this?" once per recipe, only after
                // the save went through, so the answer is logged after recipe_saved
                meal.bAskIntent = bLiked && !meal.sIntentAnswer;
                if (meals[nCurrent] === meal) RenderSavePrompt();
            } catch (error) {
                console.error("Could not save like:", error);
                meal.liked = !bLiked;
                if (meals[nCurrent] === meal) RenderLike();
            }
        });

        // ---------- "Would you actually make this?" (OKR 1) ----------
        // Shown on a meal right after it's saved, and again if the user swipes
        // away and comes back without answering. The answer is logged as
        // save_intent_answered; db/queries/okr1_discover_save.sql counts it.
        const obj_savePrompt = document.getElementById("save-prompt");
        const obj_savePromptText = document.getElementById("save-prompt-text");
        const obj_savePromptActions = document.getElementById("save-prompt-actions");
        const sSavePromptHtml = obj_savePromptText.innerHTML;
        let nThanksTimer = null;

        function RenderSavePrompt() {
            clearTimeout(nThanksTimer);
            const meal = meals[nCurrent];
            obj_savePromptText.innerHTML = sSavePromptHtml;
            obj_savePromptActions.hidden = false;
            obj_savePrompt.hidden = !(meal.bAskIntent && meal.liked);
        }

        obj_savePromptActions.addEventListener("click", function(event) {
            const obj_button = event.target.closest("[data-answer]");
            if (!obj_button) return;
            const meal = meals[nCurrent];
            meal.sIntentAnswer = obj_button.dataset.answer;
            meal.bAskIntent = false;
            window.logEvent("save_intent_answered", { recipe_id: meal.recipe_id, answer: meal.sIntentAnswer });

            obj_savePromptActions.hidden = true;
            obj_savePromptText.textContent = "Thanks! It's in your Liked recipes.";
            nThanksTimer = setTimeout(function() { obj_savePrompt.hidden = true; }, 1600);
        });

        // The start of the OKR 1 clock: the first time a new user sees this feed.
        // Not while the first-visit welcome popup or tour (js/onboarding.js) is
        // on screen, so the tour doesn't eat into the 3 minutes. If the tour
        // takes them to another page, the clock starts on their next visit here.
        function IsTourShowing() {
            return Boolean(document.querySelector("#onboarding-welcome[open], .tour"));
        }

        function LogDiscoverViewed(bWaited) {
            window.logEvent("discover_viewed", { meals: meals.length, waited_for_tour: bWaited });
        }

        if (!IsTourShowing()) {
            LogDiscoverViewed(false);
        } else {
            // the popup closing and the tour being removed both change the DOM
            const objTourWatcher = new MutationObserver(function() {
                if (IsTourShowing()) return;
                objTourWatcher.disconnect();
                LogDiscoverViewed(true);
            });
            objTourWatcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
        }

        // Finds each meal's real recipe by title, then takes its id, whether this
        // user liked it, and its average rating from GET /api/recipes. A meal
        // that isn't in the database gets recipe_id null and "No ratings yet".
        async function LoadRecipeData() {
            try {
                const response = await fetch("/api/recipes");
                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                const recipesByTitle = new Map();
                (await response.json()).forEach(function(recipe) {
                    recipesByTitle.set(recipe.recipe_title.trim().toLowerCase(), recipe);
                });

                meals.forEach(function(meal) {
                    const recipe = recipesByTitle.get(meal.recipe_title.trim().toLowerCase());
                    meal.recipe_id = recipe ? recipe.recipe_id : null;
                    meal.liked = recipe ? recipe.liked : false;
                    meal.rating_avg = recipe ? recipe.rating_avg : null;
                    meal.rating_count = recipe ? recipe.rating_count : 0;
                });
                bRecipesLoaded = true;
                RenderLike();
                RenderRating();
            } catch (error) {
                console.error("Could not load recipe data:", error);
            }
        }
        LoadRecipeData();

        // ---------- Add to meal plan popup ----------
        // The popup itself is shared with the recipe page: js/plan-dialog.js
        const obj_plan = document.getElementById("plan-dialog");

        document.getElementById("calendar-btn").addEventListener("click", function() {
            if (!HasRealRecipe(meals[nCurrent])) return;
            PlanDialog.open(meals[nCurrent], { entryPoint: "home_card" });
        });

        document.getElementById("restart-btn").addEventListener("click", function() {
            nCurrent = 0;
            obj_done.hidden = true;
            RenderMeal();
            SlideIn(1);
        });


        // ---------- Recipe page ----------
        // Clicking the recipe's name opens its own page (/recipes/:id,
        // views/recipe.ejs) with the ingredients and directions.

        document.getElementById("open-details").addEventListener("click", function() {
            // a swipe that started on the title shouldn't also open the page
            if (bSuppressClick) return;
            // wait for the real recipe id (see LoadRecipeData), so this never opens the wrong recipe
            if (!HasRealRecipe(meals[nCurrent])) return;
            location.href = "/recipes/" + encodeURIComponent(meals[nCurrent].recipe_id);
        });


        RenderMeal();
