/* My Catalogue — catalogue design templates (shared by the storefront and the admin). v11 */
(function () {
  const F = 'https://fonts.googleapis.com/css2?family=';
  const list = [
    // Industry templates (v11)
    { key: 'chocolate', name: 'Chocolate & Sweets', group: 'food', icon: '🍫', color: '#6b3e26', desc: 'Warm cocoa tones, elegant serif titles. For chocolatiers, sweets and gift boxes.', font: 'Playfair+Display:wght@600;700;800&family=Inter:wght@400;600;800', sw: ['#f6efe6', '#3b2418', '#fffaf3'] },
    { key: 'luxury', name: 'Luxury', group: 'fashion', icon: '💎', color: '#c9a45c', desc: 'Black and gold, thin lines, big photos. For jewellery, perfume, watches and premium goods.', font: 'Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600', sw: ['#0e0e0e', '#0e0e0e', '#171717'] },
    { key: 'boutique', name: 'Small Store / Boutique', group: 'retail', icon: '🛍️', color: '#b5656b', desc: 'Soft, friendly and personal. For gift shops, home décor and small local stores.', font: 'DM+Serif+Display&family=DM+Sans:wght@400;600;700', sw: ['#fbf6f2', '#fbf6f2', '#ffffff'] },
    { key: 'minimarket', name: 'Mini Market', group: 'grocery', icon: '🧺', color: '#16a34a', desc: 'Fresh and quick to browse, more products per screen. For mini markets and dekkenehs.', font: 'Nunito:wght@500;700;800;900', sw: ['#f2f7ef', '#16a34a', '#ffffff'] },
    { key: 'supermarket', name: 'Supermarket', group: 'grocery', icon: '🛒', color: '#e11d2a', desc: 'Dense grid with bold price tags, built for thousands of products. For supermarkets.', font: 'Poppins:wght@500;600;700;800', sw: ['#f4f4f4', '#e11d2a', '#ffffff'] },
    { key: 'wholesale', name: 'Wholesaler / Distributor', group: 'wholesale', icon: '📦', color: '#1f4e8c', desc: 'Clear product rows with codes, units and prices. For wholesalers, distributors and B2B.', font: 'Inter:wght@400;600;700;800', sw: ['#eef1f5', '#0f1f33', '#ffffff'] },
    { key: 'bakery', name: 'Bakery & Café', group: 'food', icon: '🥐', color: '#d9775b', desc: 'Cosy pastel cards with rounded friendly titles. For bakeries, cafés, snacks and restaurants.', font: 'Fredoka:wght@500;600;700&family=Nunito:wght@400;600;800', sw: ['#fff7f0', '#d9775b', '#ffffff'] },
    { key: 'fashion', name: 'Fashion', group: 'fashion', icon: '👗', color: '#111111', desc: 'Minimal white, tall photos, no clutter. For clothes, shoes and accessories.', font: 'Jost:wght@400;500;600;700', sw: ['#ffffff', '#ffffff', '#f4f4f4'] },
    { key: 'electronics', name: 'Electronics & Tech', group: 'tech', icon: '📱', color: '#22d3ee', desc: 'Dark tech style with neon accents. For phones, accessories, computers and gaming.', font: 'Rajdhani:wght@500;600;700&family=Inter:wght@400;600;800', sw: ['#0b1220', '#0b1220', '#111a2e'] },
    { key: 'beauty', name: 'Beauty & Pharmacy', group: 'fashion', icon: '💄', color: '#c0559a', desc: 'Soft rose and lilac, clean and gentle. For cosmetics, skincare, pharmacies and salons.', font: 'Marcellus&family=Quicksand:wght@500;600;700', sw: ['#fbf5fb', '#c0559a', '#ffffff'] },
    // Original templates
    { key: 'classic', name: 'Classic', group: 'general', icon: '🧾', color: '#7c3aed', desc: 'Clean product grid that fits any business.', sw: ['#f7f6fb', '#7c3aed', '#ffffff'] },
    { key: 'shopify', name: 'Modern Store', group: 'general', icon: '🏬', color: '#111827', desc: 'Modern store grid with thin borders.', sw: ['#f7f6fb', '#111827', '#ffffff'] },
    { key: 'premium', name: 'Premium Dark', group: 'general', icon: '🌙', color: '#7c3aed', desc: 'Dark storefront with glowing cards.', sw: ['#111827', '#7c3aed', '#1f2937'] },
    { key: 'fresh', name: 'Fresh', group: 'general', icon: '🌿', color: '#059669', desc: 'Bright rounded cards.', sw: ['#ecfdf5', '#059669', '#ffffff'] },
    { key: 'editorial', name: 'Editorial', group: 'general', icon: '📰', color: '#1f2937', desc: 'Large visual product cards.', sw: ['#f7f6fb', '#1f2937', '#ffffff'] },
    { key: 'compact', name: 'Compact', group: 'general', icon: '🔢', color: '#2563eb', desc: 'More products per screen.', sw: ['#f7f6fb', '#2563eb', '#ffffff'] },
    { key: 'list', name: 'List', group: 'general', icon: '📋', color: '#0f766e', desc: 'Horizontal product rows.', sw: ['#f7f6fb', '#0f766e', '#ffffff'] },
    { key: 'showcase', name: 'Showcase', group: 'general', icon: '🖼️', color: '#db2777', desc: 'Large product images.', sw: ['#f7f6fb', '#db2777', '#ffffff'] }
  ];
  const keys = list.map(t => t.key);
  const pack = new Set(list.filter(t => t.font).map(t => t.key));
  function get(key) { return list.find(t => t.key === key) || list.find(t => t.key === 'classic'); }
  function apply(key, color, doc) {
    doc = doc || document;
    const t = get(key), body = doc.body;
    keys.forEach(k => body.classList.remove('template-' + k));
    body.classList.add('template-' + t.key);
    body.classList.toggle('tpl-pack', pack.has(t.key));
    if (color && /^#[0-9a-f]{6}$/i.test(color)) doc.documentElement.style.setProperty('--brand', color);
    if (t.font) {
      let link = doc.getElementById('mcTplFont');
      if (!link) { link = doc.createElement('link'); link.id = 'mcTplFont'; link.rel = 'stylesheet'; doc.head.appendChild(link); }
      const href = F + t.font + '&display=swap';
      if (link.href !== href) link.href = href;
    }
    return t;
  }
  window.MCTemplates = { list, keys, get, apply, groups: { all: 'All', food: 'Food & sweets', grocery: 'Grocery & markets', retail: 'Small stores', wholesale: 'Wholesale', fashion: 'Fashion, luxury & beauty', tech: 'Tech', general: 'General' } };
})();
