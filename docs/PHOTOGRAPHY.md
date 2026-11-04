# Apartment photography

The three original example listings have **six interior photographs each**. These are
real Pexels stock photographs, **not photographs of Lemma Apartments**. Guest-facing
pages label the images as representative and label the original units as example
listings; the displayed features, rates, and inventory should be confirmed with
reception before a guest pays. Do not claim that a stock room is at the property.

## Sources and reuse terms

The photographs below came from [Pexels](https://www.pexels.com/). The
[Pexels License](https://www.pexels.com/license/) permits free personal and
commercial use, including edits, without mandatory attribution. It prohibits
selling unaltered copies as stock or implying that people or brands in an image
endorse the property. Source links are retained here for provenance and photographer
credit. Review the license if the usage changes.

| Local photograph | Pexels photograph |
| --- | --- |
| `/images/apartments/apt-01/01.jpg` | [Photo 26571206](https://www.pexels.com/photo/26571206/) |
| `/images/apartments/apt-01/02.jpg` | [Photo 7166561](https://www.pexels.com/photo/7166561/) |
| `/images/apartments/apt-01/03.jpg` | [Photo 6447393](https://www.pexels.com/photo/6447393/) |
| `/images/apartments/apt-01/04.jpg` | [Photo 7512042](https://www.pexels.com/photo/7512042/) |
| `/images/apartments/apt-01/05.jpg` | [Photo 6207941](https://www.pexels.com/photo/6207941/) |
| `/images/apartments/apt-01/06.jpg` | [Photo 23985794](https://www.pexels.com/photo/23985794/) |
| `/images/apartments/apt-02/01.jpg` | [Photo 6489119](https://www.pexels.com/photo/6489119/) |
| `/images/apartments/apt-02/02.jpg` | [Photo 29252557](https://www.pexels.com/photo/29252557/) |
| `/images/apartments/apt-02/03.jpg` | [Photo 7533919](https://www.pexels.com/photo/7533919/) |
| `/images/apartments/apt-02/04.jpg` | [Photo 7147294](https://www.pexels.com/photo/7147294/) |
| `/images/apartments/apt-02/05.jpg` | [Photo 7587806](https://www.pexels.com/photo/7587806/) |
| `/images/apartments/apt-02/06.jpg` | [Photo 7534295](https://www.pexels.com/photo/7534295/) |
| `/images/apartments/apt-03/01.jpg` | [Photo 6585598](https://www.pexels.com/photo/6585598/) |
| `/images/apartments/apt-03/02.jpg` | [Photo 7195856](https://www.pexels.com/photo/7195856/) |
| `/images/apartments/apt-03/03.jpg` | [Photo 10099254](https://www.pexels.com/photo/10099254/) |
| `/images/apartments/apt-03/04.jpg` | [Photo 29252560](https://www.pexels.com/photo/29252560/) |
| `/images/apartments/apt-03/05.jpg` | [Photo 6265836](https://www.pexels.com/photo/6265836/) |
| `/images/apartments/apt-03/06.jpg` | [Photo 20534251](https://www.pexels.com/photo/20534251/) |

The app requests higher-resolution versions from Pexels for browsers with internet
access, with the smaller checked-in JPEGs as offline fallbacks. The original generated-
looking interiors and banner have been removed. No guest, vehicle, or document images
are included in the stock gallery.

## Replacing these with property photographs

1. Photograph each actual apartment (living room, bedrooms, bathrooms, kitchen,
   entrance, and useful facilities) with permission from the property owner. Do not
   include guests, vehicle plates, IDs, or paperwork; remove location/EXIF metadata.
2. From **Admin → Apartments → [unit] → Photographs**, add the images in the correct
   order and choose a cover. Alternatively use **Admin → Media Library** and assign
   each upload to the unit. JPEG/PNG/WebP images up to 10 MB are supported, 24 per
   upload. Images should ideally be at least 1600 px wide for room detail.
3. Check the live public page. The example-listing marker is tied to the original
   sample unit IDs. If the listing is now a verified real unit, create its real
   inventory record and unpublish the old example rather than treating new photos as
   proof that the old example's rate, location, layout, and features are accurate.
4. In production, connect signed Cloudinary storage first. A serverless deployment
   without photo storage rejects new uploads; it must not store them on temporary disk.
   Local development may use the `.data/media` fallback.

Until verified property photos are supplied, keep the representative-photo disclosure
visible. If an image fails to load, the page shows a neutral frame, not a replacement
image masquerading as the apartment.
