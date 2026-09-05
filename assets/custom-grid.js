/**
 * Custom Grid Section
 * Vanilla JS only — no jQuery.
 *
 * Responsibilities:
 * 1. Show a hover preview card (image, title, price) when hovering a "+" trigger (desktop only)
 * 2. Open a shared modal popup with full product details when a trigger is clicked/tapped
 * 3. Fetch full product data on demand (via /products/{handle}.js) and render color/size
 *    options dynamically
 * 4. Handle variant matching: update price, disable unavailable combinations
 * 5. Handle Add to Cart via the Cart AJAX API, then redirect to the cart page
 * 6. Special rule: if the chosen variant is Black + Medium, also add the
 *    "Soft Winter Jacket" product to the cart automatically before redirecting
 */

(function () {
  'use strict';

  var productCache = {};

  var COLOR_MAP = {
    black: '#000000',
    white: '#ffffff',
    grey: '#999999',
    gray: '#999999',
    red: '#c8102e',
    blue: '#1a3fa0',
    green: '#2e7d32',
    orange: '#e07b1a',
    pink: '#e88fb3',
    yellow: '#f5d547',
    brown: '#7b4b2a',
    navy: '#1b1f3b',
  };

  // Handle of the product to auto-add when Black + Medium is selected.
  // Must match the actual product handle (URL slug) in this store.
  var AUTO_ADD_HANDLE = 'dark-winter-jacket';
  var AUTO_ADD_TRIGGER_OPTIONS = ['black', 'medium'];

  var modal,
    modalImage,
    modalTitle,
    modalPrice,
    modalDescription,
    modalOptions,
    modalAddToCart,
    modalMessage;
  var currentProduct = null;
  var selectedOptions = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    modal = document.querySelector('[data-grid-modal]');
    if (!modal) return;

    modalImage = modal.querySelector('[data-grid-modal-image]');
    modalTitle = modal.querySelector('[data-grid-modal-title]');
    modalPrice = modal.querySelector('[data-grid-modal-price]');
    modalDescription = modal.querySelector('[data-grid-modal-description]');
    modalOptions = modal.querySelector('[data-grid-modal-options]');
    modalAddToCart = modal.querySelector('[data-grid-add-to-cart]');
    modalMessage = modal.querySelector('[data-grid-modal-message]');

    setupTriggers();
    setupModalClose();
    modalAddToCart.addEventListener('click', handleAddToCart);
  }

  /* --------------------------------------------------------------------
     Hover card + click/tap trigger
     -------------------------------------------------------------------- */

  function setupTriggers() {
    var triggers = document.querySelectorAll('[data-grid-trigger]');

    triggers.forEach(function (trigger) {
      var item = trigger.closest('.custom-grid__item');
      var hovercard = item.querySelector('[data-grid-hovercard]');

      trigger.addEventListener('mouseenter', function () {
        if (!hovercard) return;
        positionHovercard(trigger, hovercard, item);
        hovercard.hidden = false;
      });

      trigger.addEventListener('mouseleave', function () {
        if (!hovercard) return;
        hovercard.hidden = true;
      });

      if (hovercard) {
        hovercard.style.pointerEvents = 'auto';
        hovercard.addEventListener('click', function () {
          openModal(trigger);
        });
      }

      trigger.addEventListener('click', function () {
        openModal(trigger);
      });
    });
  }

  // Positions the hover card relative to the trigger, flipping left/up
  // if it would overflow the right or bottom edge of the viewport.
  function positionHovercard(trigger, hovercard, container) {
    var containerRect = container.getBoundingClientRect();
    var cardWidth = 260;
    var cardHeight = hovercard.offsetHeight || 84;
    var spaceRight = window.innerWidth - containerRect.right;
    var spaceBottom = window.innerHeight - containerRect.top;

    var triggerLeftPercent = parseFloat(trigger.style.left) || 50;
    var triggerTopPercent = parseFloat(trigger.style.top) || 50;

    var left, top;

    if (spaceRight > cardWidth + 20) {
      left = 'calc(' + triggerLeftPercent + '% + 24px)';
    } else {
      left = 'calc(' + triggerLeftPercent + '% - ' + (cardWidth + 24) + 'px)';
    }

    if (spaceBottom > cardHeight + 20) {
      top = triggerTopPercent + '%';
    } else {
      top = 'calc(' + triggerTopPercent + '% - ' + (cardHeight + 10) + 'px)';
    }

    hovercard.style.left = left;
    hovercard.style.top = top;
  }

  /* --------------------------------------------------------------------
     Modal open/close
     -------------------------------------------------------------------- */

  function setupModalClose() {
    var closeEls = modal.querySelectorAll('[data-grid-modal-close]');
    closeEls.forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  function openModal(trigger) {
    var handle = trigger.getAttribute('data-product-handle');

    modalTitle.textContent = trigger.getAttribute('data-product-title');
    modalPrice.textContent = trigger.getAttribute('data-product-price');
    modalImage.src = trigger.getAttribute('data-product-image');
    modalDescription.textContent = '';
    modalOptions.innerHTML = '';
    modalMessage.textContent = '';
    modalAddToCart.disabled = true;

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    fetchProduct(handle)
      .then(function (product) {
        currentProduct = product;
        selectedOptions = {};
        renderProductDetails(product);
      })
      .catch(function (err) {
        console.error(
          '[custom-grid] Failed to load product "' + handle + '":',
          err,
        );
        modalMessage.textContent = 'Sorry, this product could not be loaded.';
      });
  }

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentProduct = null;
    selectedOptions = {};
  }

  /* --------------------------------------------------------------------
     Fetching product data
     -------------------------------------------------------------------- */

  function fetchProduct(handle) {
    if (productCache[handle]) {
      return Promise.resolve(productCache[handle]);
    }
    return fetch('/products/' + handle + '.js')
      .then(function (res) {
        if (!res.ok)
          throw new Error('Product fetch failed with status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // The /products/{handle}.js endpoint returns `options` as an array of
        // objects ({ name, position, values }), not plain strings like Liquid's
        // product.options. Normalize to strings so the rest of the code
        // (which expects option NAMES as strings) doesn't need special-casing.
        data.options = (data.options || []).map(function (opt) {
          return typeof opt === 'string' ? opt : opt.name;
        });
        productCache[handle] = data;
        return data;
      });
  }

  /* --------------------------------------------------------------------
     Rendering product details + options
     -------------------------------------------------------------------- */

  function renderProductDetails(product) {
    modalTitle.textContent = product.title;
    modalDescription.textContent = stripHtml(product.description).slice(0, 200);

    if (product.featured_image) {
      modalImage.src = product.featured_image.replace(
        /(\.[a-zA-Z]+)(\?.*)?$/,
        '_800x$1$2',
      );
    }

    var variants = product.variants || [];
    var options = product.options || [];

    if (!variants.length) {
      throw new Error('Product "' + product.handle + '" has no variants.');
    }

    var firstAvailable =
      variants.find(function (v) {
        return v.available;
      }) || variants[0];

    options.forEach(function (optionName, index) {
      selectedOptions[optionName] = firstAvailable.options[index];
    });

    modalOptions.innerHTML = '';

    options.forEach(function (optionName, index) {
      var values = getUniqueOptionValues(product, index);

      // Skip rendering a picker for products with only the default
      // "Title" / "Default Title" option (i.e. no real variants to choose from).
      if (values.length === 1 && values[0].toLowerCase() === 'default title') {
        return;
      }

      var group = buildOptionGroup(optionName, values, index, product);
      modalOptions.appendChild(group);
    });

    updateVariantState(product);
  }

  function getUniqueOptionValues(product, optionIndex) {
    var seen = [];
    product.variants.forEach(function (variant) {
      var value = variant.options[optionIndex];
      if (seen.indexOf(value) === -1) seen.push(value);
    });
    return seen;
  }

  function buildOptionGroup(optionName, values, optionIndex, product) {
    var wrap = document.createElement('div');
    wrap.className = 'custom-grid__option-group';

    var label = document.createElement('span');
    label.className = 'custom-grid__option-label';
    label.textContent = optionName;
    wrap.appendChild(label);

    var isColor =
      optionName.toLowerCase().indexOf('color') !== -1 ||
      optionName.toLowerCase().indexOf('colour') !== -1;

    if (isColor) {
      wrap.appendChild(
        buildSwatchRow(optionName, values, optionIndex, product),
      );
    } else {
      wrap.appendChild(buildDropdown(optionName, values, optionIndex, product));
    }

    return wrap;
  }

  function buildSwatchRow(optionName, values, optionIndex, product) {
    var row = document.createElement('div');
    row.className = 'custom-grid__swatch-row';

    values.forEach(function (value) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-grid__swatch';
      btn.textContent = value;
      btn.style.setProperty(
        '--swatch-color',
        COLOR_MAP[value.toLowerCase()] || '#cccccc',
      );
      btn.setAttribute(
        'aria-pressed',
        selectedOptions[optionName] === value ? 'true' : 'false',
      );

      btn.addEventListener('click', function () {
        selectedOptions[optionName] = value;
        row.querySelectorAll('.custom-grid__swatch').forEach(function (b) {
          b.setAttribute(
            'aria-pressed',
            b.textContent === value ? 'true' : 'false',
          );
        });
        updateVariantState(product);
      });

      row.appendChild(btn);
    });

    return row;
  }

  function buildDropdown(optionName, values, optionIndex, product) {
    var dropdown = document.createElement('div');
    dropdown.className = 'custom-grid__dropdown';
    dropdown.setAttribute('data-open', 'false');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'custom-grid__dropdown-toggle';
    toggle.innerHTML =
      '<span data-dropdown-label>' +
      (selectedOptions[optionName] ||
        'Choose your ' + optionName.toLowerCase()) +
      '</span>' +
      '<span class="icon-down" aria-hidden="true">&#9660;</span>' +
      '<span class="icon-up" aria-hidden="true">&#9650;</span>';

    var list = document.createElement('div');
    list.className = 'custom-grid__dropdown-list';

    values.forEach(function (value) {
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'custom-grid__dropdown-option';
      option.textContent = value;
      option.setAttribute(
        'aria-selected',
        selectedOptions[optionName] === value ? 'true' : 'false',
      );

      option.addEventListener('click', function () {
        selectedOptions[optionName] = value;
        toggle.querySelector('[data-dropdown-label]').textContent = value;
        list
          .querySelectorAll('.custom-grid__dropdown-option')
          .forEach(function (o) {
            o.setAttribute(
              'aria-selected',
              o.textContent === value ? 'true' : 'false',
            );
          });
        dropdown.setAttribute('data-open', 'false');
        updateVariantState(product);
      });

      list.appendChild(option);
    });

    toggle.addEventListener('click', function () {
      var isOpen = dropdown.getAttribute('data-open') === 'true';
      dropdown.setAttribute('data-open', isOpen ? 'false' : 'true');
    });

    dropdown.appendChild(toggle);
    dropdown.appendChild(list);
    return dropdown;
  }

  /* --------------------------------------------------------------------
     Variant matching + availability
     -------------------------------------------------------------------- */

  function findMatchingVariant(product) {
    return product.variants.find(function (variant) {
      return product.options.every(function (optionName, index) {
        return variant.options[index] === selectedOptions[optionName];
      });
    });
  }

  function updateVariantState(product) {
    product.options.forEach(function (optionName) {
      var buttons = modalOptions.querySelectorAll(
        '.custom-grid__swatch, .custom-grid__dropdown-option',
      );
      buttons.forEach(function (btn) {
        if (!belongsToOption(btn, optionName)) return;

        var value = btn.textContent;
        var testOptions = Object.assign({}, selectedOptions);
        testOptions[optionName] = value;

        var wouldMatch = product.variants.some(function (variant) {
          return product.options.every(function (name, i) {
            return variant.options[i] === testOptions[name];
          });
        });

        var isAvailable = product.variants.some(function (variant) {
          if (!variant.available) return false;
          return product.options.every(function (name, i) {
            return variant.options[i] === testOptions[name];
          });
        });

        btn.disabled = wouldMatch && !isAvailable;
      });
    });

    var variant = findMatchingVariant(product);

    if (variant) {
      modalPrice.textContent = formatMoney(variant.price);
      modalAddToCart.disabled = !variant.available;
      modalMessage.textContent = variant.available
        ? ''
        : 'This combination is out of stock.';
      modalAddToCart.setAttribute('data-variant-id', variant.id);
    } else {
      modalAddToCart.disabled = true;
      modalAddToCart.removeAttribute('data-variant-id');
    }
  }

  function belongsToOption(btn, optionName) {
    var group = btn.closest('.custom-grid__option-group');
    if (!group) return false;
    var label = group.querySelector('.custom-grid__option-label');
    return label && label.textContent === optionName;
  }

  /* --------------------------------------------------------------------
     Add to Cart
     -------------------------------------------------------------------- */

  function handleAddToCart() {
    var variantId = modalAddToCart.getAttribute('data-variant-id');
    if (!variantId) return;

    modalAddToCart.disabled = true;
    modalMessage.textContent = 'Adding to cart...';

    addToCart(variantId, 1)
      .then(function () {
        if (shouldAutoAddJacket()) {
          return addAutoAddProduct();
        }
      })
      .then(function () {
        modalMessage.textContent = 'Added to cart! Redirecting...';
        document.dispatchEvent(new CustomEvent('cart:updated'));
        window.location.href = '/cart';
      })
      .catch(function (err) {
        console.error('[custom-grid] Add to cart failed:', err);
        modalMessage.textContent =
          'Something went wrong adding this to your cart.';
        modalAddToCart.disabled = false;
      });
  }

  function addToCart(variantId, quantity) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: quantity }),
    }).then(function (res) {
      if (!res.ok)
        throw new Error('Add to cart failed with status ' + res.status);
      return res.json();
    });
  }

  // Checks whether the currently selected options match the Black + Medium rule
  function shouldAutoAddJacket() {
    var values = Object.keys(selectedOptions).map(function (key) {
      return String(selectedOptions[key]).toLowerCase();
    });
    return AUTO_ADD_TRIGGER_OPTIONS.every(function (needed) {
      return values.indexOf(needed) !== -1;
    });
  }

  function addAutoAddProduct() {
    return fetchProduct(AUTO_ADD_HANDLE).then(function (jacketProduct) {
      var jacketVariant = jacketProduct.variants.find(function (v) {
        return v.available;
      });
      if (!jacketVariant) return;
      return addToCart(jacketVariant.id, 1);
    });
  }

  /* --------------------------------------------------------------------
     Utilities
     -------------------------------------------------------------------- */

  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
  }

  function formatMoney(cents) {
    return (cents / 100).toLocaleString(undefined, {
      style: 'currency',
      currency:
        (window.Shopify &&
          window.Shopify.currency &&
          window.Shopify.currency.active) ||
        'USD',
    });
  }
})();
