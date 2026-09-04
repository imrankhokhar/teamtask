/** ponytail: assert card-size presets change column count / width. Run: node src/listLayout.check.js */
const PHONE_MAX = 700;
const SIDEBAR_RAIL = 56;
const spacing = { cardGap: 12, cardPad: 12 };

const CARD_SIZE_PRESETS = {
  compact: { preferredCard: 220, padPhone: 8, padDesktop: 8, gap: 8, cardPad: 10 },
  comfortable: { preferredCard: 280, padPhone: 10, padDesktop: 12, gap: spacing.cardGap, cardPad: spacing.cardPad },
  large: { preferredCard: 460, padPhone: 10, padDesktop: 14, gap: 18, cardPad: 22 },
};

function listLayoutFor(windowWidth, contentWidth = 0, cardSize = 'comfortable') {
  const preset = CARD_SIZE_PRESETS[cardSize];
  const phone = windowWidth < PHONE_MAX;
  const pad = phone ? preset.padPhone : preset.padDesktop;
  const gap = preset.gap;
  const column = contentWidth > 40 ? contentWidth : Math.max(200, windowWidth - (phone ? SIDEBAR_RAIL : 0));
  const inner = Math.max(160, column - pad * 2);
  const cols = phone ? 1 : Math.max(1, Math.min(4, Math.floor((inner + gap) / (preset.preferredCard + gap))));
  let cardWidth = Math.floor((inner - gap * (cols - 1)) / cols);
  if (cols === 1) {
    cardWidth = Math.min(inner, cardSize === 'large' ? inner : preset.preferredCard);
  }
  return { cols, cardWidth, cardPad: preset.cardPad };
}

const wide = {
  compact: listLayoutFor(1400, 1100, 'compact'),
  comfortable: listLayoutFor(1400, 1100, 'comfortable'),
  large: listLayoutFor(1400, 1100, 'large'),
};
console.assert(wide.compact.cols > wide.large.cols, 'wide: compact should have more cols than large', wide);
console.assert(wide.large.cardWidth > wide.compact.cardWidth, 'wide: large cards wider', wide);

const phone = {
  compact: listLayoutFor(390, 334, 'compact'),
  comfortable: listLayoutFor(390, 334, 'comfortable'),
  large: listLayoutFor(390, 334, 'large'),
};
console.assert(phone.large.cardWidth > phone.comfortable.cardWidth, 'phone: large wider than comfortable', phone);
console.assert(phone.comfortable.cardWidth > phone.compact.cardWidth, 'phone: comfortable wider than compact', phone);
console.assert(phone.large.cardPad > phone.comfortable.cardPad, 'phone: large has more pad', phone);

console.log('listLayout.check.js OK', { wide, phone });
