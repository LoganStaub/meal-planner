
        // The home page only ever shows this many meals at a time
        const MAX_MEALS = 5;

        // Placeholder meals until this page loads from GET /api/recipes.
        // recipe_id, recipe_title, prep_time and recipe_class_desc match the database.
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
        let bAnimating = false;

        const obj_stage = document.getElementById("stage");
        const obj_slide = document.getElementById("slide");
        const obj_photo = document.getElementById("meal-photo");
        const obj_done = document.getElementById("done");
        const obj_progress = document.getElementById("progress");
        const obj_like = document.getElementById("like-btn");
        const obj_dialog = document.getElementById("recipe-details");
        const obj_profile = document.getElementById("profile");
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

        function RenderLike() {
            const bLiked = Boolean(meals[nCurrent].liked);
            obj_like.setAttribute("aria-pressed", String(bLiked));
            document.getElementById("like-label").textContent = bLiked ? "Liked" : "Like";
        }


        // moves to the next (+1) or previous (-1) meal with a slide animation.
        // nFromX is where the card was dragged to, so the animation continues from there.
        async function GoTo(nDirection, nFromX = 0) {
            if (bAnimating || obj_dialog.open || obj_profile.open) return;

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
            if (event.target.closest(".card-actions, .app-header, .stage-arrows")) return;

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
            const bLiked = !meal.liked;
            meal.liked = bLiked;
            RenderLike();

            try {
                const response = await fetch(`/api/me/likes/${encodeURIComponent(meal.recipe_id)}`, {
                    method: bLiked ? "PUT" : "DELETE"
                });
                if (!response.ok) throw new Error(`Request failed (${response.status})`);
            } catch (error) {
                console.error("Could not save like:", error);
                meal.liked = !bLiked;
                if (meals[nCurrent] === meal) RenderLike();
            }
        });

        // marks the meals this user has already liked
        async function LoadLikes() {
            try {
                const response = await fetch("/api/me/likes");
                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                const likedIds = new Set(await response.json());
                meals.forEach(function(meal) {
                    meal.liked = likedIds.has(meal.recipe_id);
                });
                RenderLike();
            } catch (error) {
                console.error("Could not load likes:", error);
            }
        }
        LoadLikes();

        // TODO: open a date/meal slot picker and save to the calendar table
        document.getElementById("calendar-btn").addEventListener("click", function() {
            console.log("Add to calendar:", meals[nCurrent].recipe_title);
        });

        document.getElementById("restart-btn").addEventListener("click", function() {
            nCurrent = 0;
            obj_done.hidden = true;
            RenderMeal();
            SlideIn(1);
        });


        // ---------- Recipe details popup ----------

        document.getElementById("open-details").addEventListener("click", function() {
            // a swipe that started on the title shouldn't also open the popup
            if (bSuppressClick) return;

            document.getElementById("details-title").textContent = meals[nCurrent].recipe_title;
            obj_dialog.dataset.recipeId = meals[nCurrent].recipe_id;
            obj_dialog.showModal();
        });

        document.getElementById("close-details").addEventListener("click", function() {
            obj_dialog.close();
        });

        // clicking the dimmed background closes the popup
        obj_dialog.addEventListener("click", function(event) {
            if (event.target === obj_dialog) obj_dialog.close();
        });


        // ---------- Profile and settings popup ----------

        document.getElementById("open-profile").addEventListener("click", function() {
            obj_profile.showModal();
        });

        document.getElementById("close-profile").addEventListener("click", function() {
            obj_profile.close();
        });

        // clicking the dimmed background closes the popup
        obj_profile.addEventListener("click", function(event) {
            if (event.target === obj_profile) obj_profile.close();
        });

        RenderMeal();
