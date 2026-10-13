# Waffle Batter Calculator

A mobile-first, single-page calculator that scales a waffle batter recipe by number of servings.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```sh
npx serve .
# or
python3 -m http.server
```

## Recipe

The base recipe (top of the `<script>` in `index.html`, the `RECIPE` object) makes **3 servings**:

| Ingredient     | Amount                     |
|----------------|----------------------------|
| Plain flour    | 225 g                      |
| Baking powder  | 10 g                       |
| Salt           | 1.3 g per 100 g of flour   |
| Butter, melted | 50 g                       |
| Large egg      | 1                          |
| Milk           | 250 ml                     |

Every ingredient scales linearly with `servings / 3`.

## Display rules

- Eggs round to the nearest quarter (e.g. 1¼) with the beaten-egg weight shown underneath (1 large egg ≈ 50 g).
- Baking powder and salt also show an approximate teaspoon amount (≈ 4 g/tsp baking powder, ≈ 6 g/tsp fine salt), rounded to the nearest ⅛ tsp.
- The total batter weight is shown under the servings stepper.
- Rows can be ticked off while measuring; ticks reset on reload.

## Design

- Font: Montserrat (Google Fonts)
- Colours are CSS variables in `:root` at the top of the `<style>` block.
- One column on phones; two columns (servings card left, ingredient list right) from 900 px wide.
