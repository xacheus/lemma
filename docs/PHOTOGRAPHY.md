# Photography

The product is built around real apartment photography. **No images are shipped in this repository and none are invented** — every frame you see is a correctly-sized placeholder waiting for the file named in its caption.

## Where files go

```
public/images/
├── lobby.jpg                      sign-in screen side panel (16 / 7)
├── hero/
│   ├── home-1.jpg                 public home page hero (21 / 9)
│   └── home-2.jpg                 secondary hero tile (4 / 3)
├── apartments/
│   └── apt-01/ … apt-NN/
│       ├── 01.jpg                 primary card image — 16 / 10
│       ├── 02.jpg … 05.jpg        gallery frames — 4 / 3
├── property/
│   ├── exterior.jpg               3 / 2
│   ├── kitchen.jpg                4 / 3
│   └── amenities/*.jpg            1 / 1
└── og/
    └── share.jpg                  1200 × 630 social card
```

Apartment folders are zero-padded to two digits. Each apartment's `photos` array holds the paths in display order, and the admin UI (Apartments → Edit → *Photograph paths*, one path per line) is how you change them — no code edit needed. The `PhotoFrame` component listens for a failed load and quietly swaps back to the placeholder, so adding a file is the whole deployment: drop it in the folder, refresh, done.

## Sizing

| Use | Aspect | Minimum width | Notes |
| --- | --- | --- | --- |
| Card / list primary | 16 / 10 | 1600 px | Cropped by CSS (`object-cover`), so keep the subject centred |
| Gallery | 4 / 3 | 1600 px | One image per feature: bedroom, bathroom, kitchen, view |
| Hero | 21 / 9 | 2400 px | Darker left third for headline legibility; no text burned in |
| Social / print header | 1200 × 630 | — | Safe margin of 60 px |

Export as `.jpg`, quality 80, sRGB, no GPS/EXIF beyond orientation. Target under 400 KB per file; the placeholder frames assume a 3-second load budget on Lusaka 4G.

## What to shoot (property list)

For each unit, in this order — the sequence is what the gallery slots expect:

1. **Wide entry shot** from the doorway, showing the living space and the window
2. **Bedroom**, lights on, bed dressed, no personal items
3. **Bathroom**, towels folded, mirror clean
4. **Kitchen / kitchenette**, counters empty
5. **The view or balcony** (only genuinely available on floors 1–2 and the penthouse)

Plus property-wide: facade from the pavement at dusk, gate and parking, lobby/reception, laundry, backup power and borehole plant (guests ask about load-shedding and water), and one human-scale shot (staff member at the desk, hand over keys) for trust.

## Handling guest images

Never publish a photograph that shows a guest, their vehicle plate, or documents on a desk. When a unit is photographed between stays, remove or blur anything left behind rather than showing it.

## Placeholder behaviour, on purpose

`PhotoFrame` renders a soft sand-toned frame with a hairline grid, the alt text and a caption — "Property photograph — to be supplied". It is deliberately visible so the gap reads as *pending*, not as a broken build. The layout, ratios and cropping are final, so real images drop in without touching any component.
