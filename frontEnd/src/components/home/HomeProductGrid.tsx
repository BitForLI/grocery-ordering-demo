import React, { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { useMaxWidth } from '../../hooks/useMediaQuery';
import { resolveProductImageUrl } from '../../utils/imageUrl';
import plusIcon from '../../assets/images/add.png';
import minusIcon from '../../assets/images/minus.png';
import {
  defaultEstKgForProduct,
  GRID_GAP,
  WEIGHT_MIN_KG,
  WEIGHT_STEP_KG,
  type Product,
} from './homeCatalog';

const CART_BTN = 'clamp(26px, 6.5vw, 38px)';
const CART_ICON = 'clamp(13px, 3.2vw, 20px)';
const CART_FS = 'clamp(0.66rem, 1.9vw, 0.88rem)';

export function SpecialProductList({ products, productImage }: { products: Product[]; productImage: string }) {
  const isMobileGrid = useMaxWidth(540);
  const isTabletGrid = useMaxWidth(768);
  const specialGrid = isMobileGrid ? 'repeat(2, 1fr)' : isTabletGrid ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: specialGrid,
        alignItems: 'start',
        gap: GRID_GAP,
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {products.map((p) => (
        <SpecialCard key={p.id} product={p} productImage={productImage} />
      ))}
    </div>
  );
}

const titleClampStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
};

/** 白底红边「Add to cart」；有货后变为药丸步进器；减到 0 恢复 */
function HomeCartToggle({
  product,
  productImage,
  selectedUnit,
  selectedUnitPrice,
}: {
  product: Product;
  productImage: string;
  selectedUnit: string;
  selectedUnitPrice: number;
}) {
  const { items, addItem, updateQuantity, removeItem, updateExpectedWeightKg } = useCart();
  const line = items.find((i) => i.productId === product.id);
  const cartQty = line?.quantity ?? 0;
  const isKgUnit = selectedUnit.toLowerCase() === 'kg';
  const estKg =
    isKgUnit && line?.isWeighingRequired
      ? Number(line.expectedWeightKg ?? defaultEstKgForProduct(product))
      : 0;

  const base = () => ({
    productId: product.id,
    name: product.name,
    price: selectedUnitPrice,
    selectedUnit,
    imageUrl: product.imageUrl || productImage,
  });

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isKgUnit) {
      addItem({
        ...base(),
        quantity: 1,
        isWeighingRequired: true,
        expectedWeightKg: defaultEstKgForProduct(product),
      });
    } else {
      addItem({ ...base(), quantity: 1 });
    }
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isKgUnit && line?.isWeighingRequired) {
      const w = estKg - WEIGHT_STEP_KG;
      if (w < WEIGHT_MIN_KG - 1e-9) removeItem(product.id);
      else updateExpectedWeightKg(product.id, Math.round(w * 1000) / 1000);
      return;
    }
    if (cartQty <= 1) removeItem(product.id);
    else updateQuantity(product.id, cartQty - 1);
  };

  const handlePlus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isKgUnit) {
      if (line?.isWeighingRequired) {
        updateExpectedWeightKg(product.id, Math.round((estKg + WEIGHT_STEP_KG) * 1000) / 1000);
      } else {
        addItem({
          ...base(),
          quantity: 1,
          isWeighingRequired: true,
          expectedWeightKg: defaultEstKgForProduct(product),
        });
      }
      return;
    }
    addItem({ ...base(), quantity: 1 });
  };

  const pillBorder = '1px solid #dc2626';
  const rowMinH = CART_BTN;

  const inCartWeighing = Boolean(isKgUnit && line?.isWeighingRequired && estKg > 0);
  const inCartCount = isKgUnit ? (inCartWeighing ? 1 : 0) : cartQty;

  if (inCartCount === 0) {
    return (
      <button
        type="button"
        onClick={handleAdd}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: rowMinH,
          boxSizing: 'border-box',
          backgroundColor: '#fff',
          border: pillBorder,
          borderRadius: 9999,
          padding: 'clamp(0.04rem, 0.5vw, 0.08rem) clamp(0.38rem, 1.5vw, 0.6rem)',
          cursor: 'pointer',
          fontWeight: 700,
          color: '#dc2626',
          fontSize: CART_FS,
          lineHeight: 1.15,
          opacity: 1,
          whiteSpace: 'nowrap',
        }}
      >
        Add to cart
      </button>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          minHeight: rowMinH,
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          columnGap: 'clamp(0.22rem, 1vw, 0.4rem)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
          <button
            type="button"
            onClick={handleMinus}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 0,
              width: CART_BTN,
              height: CART_BTN,
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <img
              src={minusIcon}
              alt=""
              style={{ width: CART_ICON, height: CART_ICON, objectFit: 'contain', display: 'block' }}
            />
          </button>
        </div>
        <span
          style={{
            minWidth: 'clamp(18px, 5vw, 28px)',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: CART_FS,
            color: '#111827',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isKgUnit ? `${estKg.toFixed(2)} kg` : cartQty}
        </span>
        <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
          <button
            type="button"
            onClick={handlePlus}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 0,
              opacity: 1,
              width: CART_BTN,
              height: CART_BTN,
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <img
              src={plusIcon}
              alt=""
              style={{ width: CART_ICON, height: CART_ICON, objectFit: 'contain', display: 'block' }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecialCard({ product, productImage }: { product: Product; productImage: string }) {
  const options = product.unitPriceOptions && product.unitPriceOptions.length > 0
    ? product.unitPriceOptions
    : [{ unit: product.unit || 'ea', price: Number(product.price || 0) }];
  const [selectedUnit, setSelectedUnit] = useState(options[0].unit);
  const selected = options.find((o) => o.unit === selectedUnit) ?? options[0];
  const priceValue = Number(selected?.price ?? product.price);
  const unitValue = selected?.unit ?? product.unit;
  const { items, addItem, removeItem } = useCart();
  const cartLine = items.find((i) => i.productId === product.id);

  const handleUnitChange = (nextUnit: string) => {
    setSelectedUnit(nextUnit);
    if (!cartLine) return;
    const nextPrice = options.find((o) => o.unit === nextUnit)?.price ?? priceValue;
    const cartQty = cartLine.quantity ?? 1;
    const currentEstKg = cartLine.isWeighingRequired && cartLine.expectedWeightKg != null
      ? Number(cartLine.expectedWeightKg) : defaultEstKgForProduct(product);
    removeItem(product.id);
    if (nextUnit.toLowerCase() === 'kg') {
      addItem({
        productId: product.id, name: product.name, price: Number(nextPrice),
        selectedUnit: nextUnit, quantity: 1, imageUrl: product.imageUrl || productImage,
        isWeighingRequired: true, expectedWeightKg: currentEstKg > 0 ? currentEstKg : defaultEstKgForProduct(product),
      });
    } else {
      addItem({
        productId: product.id, name: product.name, price: Number(nextPrice),
        selectedUnit: nextUnit, quantity: cartQty > 0 ? cartQty : 1,
        imageUrl: product.imageUrl || productImage, isWeighingRequired: false,
      });
    }
  };

  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        alignSelf: 'start',
        backgroundColor: 'white',
        borderRadius: 'clamp(6px, 1.2vw, 10px)',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s',
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {product.discountLabel && (
        <div
          style={{
            flexShrink: 0,
            backgroundColor: '#dc2626',
            color: 'white',
            padding: 'clamp(0.2rem, 0.9vw, 0.38rem) clamp(0.28rem, 1vw, 0.5rem)',
            fontSize: 'clamp(0.62rem, 1.7vw, 0.84rem)',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: '0.06em',
          }}
        >
          {product.discountLabel}
        </div>
      )}
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          backgroundColor: '#f9fafb',
          borderRadius: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={resolveProductImageUrl(product.imageUrl, productImage)}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div
        style={{
          padding: 'clamp(0.3rem, 1.3vw, 0.55rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(0.18rem, 1vw, 0.35rem)',
        }}
      >
        <h3
          style={{
            ...titleClampStyle,
            fontSize: 'clamp(0.64rem, 2vw, 0.88rem)',
            fontWeight: 'bold',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {product.name}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(0.52rem, 1.5vw, 0.7rem)',
            color: '#9ca3af',
            lineHeight: '1.3em',
            height: '1.3em',
            minHeight: '1.3em',
            maxHeight: '1.3em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {product.description?.trim() || '\u00A0'}
        </p>
        {product.wasPrice != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
            <span
              style={{
                backgroundColor: '#fef08a',
                padding: '0.08rem 0.2rem',
                borderRadius: '4px',
                fontSize: 'clamp(0.52rem, 1.4vw, 0.65rem)',
                textDecoration: 'line-through',
              }}
            >
              was ${product.wasPrice.toFixed(2)}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                color: '#9ca3af',
                fontSize: 'clamp(0.62rem, 1.6vw, 0.78rem)',
                cursor: 'pointer',
              }}
              title="Add to favourites"
            >
              ♡
            </span>
          </div>
        )}
        <div
          style={{
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.06rem, 0.6vw, 0.12rem)',
            marginTop: 'clamp(0.08rem, 0.8vw, 0.16rem)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', lineHeight: 1.2 }}>
            <span style={{ fontSize: 'clamp(0.82rem, 2.5vw, 1.08rem)', fontWeight: 'bold', color: '#dc2626', lineHeight: 1.2 }}>
              ${priceValue.toFixed(2)}
            </span>
            {options.length > 1 ? (
              <select
                value={selectedUnit}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); handleUnitChange(e.target.value); }}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '1px 3px', fontSize: 'clamp(0.6rem, 1.6vw, 0.74rem)', background: '#fff', cursor: 'pointer', color: '#6b7280' }}
              >
                {options.map((o) => (
                  <option key={o.unit} value={o.unit}>/{o.unit}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 'clamp(0.58rem, 1.6vw, 0.74rem)', color: '#999' }}>/{unitValue}</span>
            )}
          </div>
          <HomeCartToggle
            product={product}
            productImage={productImage}
            selectedUnit={unitValue}
            selectedUnitPrice={priceValue}
          />
        </div>
      </div>
    </div>
  );
}

export function ProductCard({ product, productImage }: { product: Product; productImage: string }) {
  const options = product.unitPriceOptions && product.unitPriceOptions.length > 0
    ? product.unitPriceOptions
    : [{ unit: product.unit || 'ea', price: Number(product.price || 0) }];
  const [selectedUnit, setSelectedUnit] = useState(options[0].unit);
  const selected = options.find((o) => o.unit === selectedUnit) ?? options[0];
  const priceValue = Number(selected?.price ?? product.price);
  const unitValue = selected?.unit ?? product.unit;
  const { items, addItem, removeItem } = useCart();
  const cartLine = items.find((i) => i.productId === product.id);

  const handleUnitChange = (nextUnit: string) => {
    setSelectedUnit(nextUnit);
    if (!cartLine) return;
    const nextPrice = options.find((o) => o.unit === nextUnit)?.price ?? priceValue;
    const cartQty = cartLine.quantity ?? 1;
    const currentEstKg = cartLine.isWeighingRequired && cartLine.expectedWeightKg != null
      ? Number(cartLine.expectedWeightKg) : defaultEstKgForProduct(product);
    removeItem(product.id);
    if (nextUnit.toLowerCase() === 'kg') {
      addItem({
        productId: product.id, name: product.name, price: Number(nextPrice),
        selectedUnit: nextUnit, quantity: 1, imageUrl: product.imageUrl || productImage,
        isWeighingRequired: true, expectedWeightKg: currentEstKg > 0 ? currentEstKg : defaultEstKgForProduct(product),
      });
    } else {
      addItem({
        productId: product.id, name: product.name, price: Number(nextPrice),
        selectedUnit: nextUnit, quantity: cartQty > 0 ? cartQty : 1,
        imageUrl: product.imageUrl || productImage, isWeighingRequired: false,
      });
    }
  };

  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        alignSelf: 'start',
        border: '1px solid #e5e7eb',
        borderRadius: 'clamp(6px, 1.2vw, 10px)',
        padding: 'clamp(0.32rem, 1.4vw, 0.65rem)',
        backgroundColor: 'white',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: 'clamp(5px, 1vw, 8px)',
          overflow: 'hidden',
          backgroundColor: '#f3f4f6',
        }}
      >
        <img
          src={resolveProductImageUrl(product.imageUrl, productImage)}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 'clamp(0.22rem, 1.1vw, 0.42rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(0.12rem, 1vw, 0.26rem)',
        }}
      >
        <h3
          style={{
            ...titleClampStyle,
            fontSize: 'clamp(0.68rem, 2.1vw, 0.98rem)',
            fontWeight: 'bold',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {product.name}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(0.54rem, 1.6vw, 0.72rem)',
            color: '#9ca3af',
            lineHeight: '1.3em',
            height: '1.3em',
            minHeight: '1.3em',
            maxHeight: '1.3em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {product.description?.trim() || '\u00A0'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.06rem, 0.6vw, 0.12rem)', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', lineHeight: 1.2, minWidth: 0 }}>
            <span style={{ fontSize: 'clamp(0.86rem, 2.6vw, 1.15rem)', fontWeight: 'bold', color: '#dc2626' }}>
              ${priceValue.toFixed(2)}
            </span>
            {options.length > 1 ? (
              <select
                value={selectedUnit}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); handleUnitChange(e.target.value); }}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '1px 3px', fontSize: 'clamp(0.62rem, 1.8vw, 0.78rem)', background: '#fff', cursor: 'pointer', color: '#6b7280' }}
              >
                {options.map((o) => (
                  <option key={o.unit} value={o.unit}>/{o.unit}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 'clamp(0.58rem, 1.6vw, 0.78rem)', color: '#999' }}>/{unitValue}</span>
            )}
          </div>
          <HomeCartToggle
            product={product}
            productImage={productImage}
            selectedUnit={unitValue}
            selectedUnitPrice={priceValue}
          />
        </div>
      </div>
    </div>
  );
}
