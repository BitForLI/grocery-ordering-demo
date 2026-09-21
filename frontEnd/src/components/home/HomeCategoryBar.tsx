import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppstoreOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import vegetableIcon from '../../assets/images/vegetable.png';
import fruitIcon from '../../assets/images/fruit.png';
import specialCategoryIcon from '../../assets/images/specials.png';
import recommendedCategoryIcon from '../../assets/images/recommended.png';
import groceryCategoryIcon from '../../assets/images/grocery.png';
import frozenCategoryIcon from '../../assets/images/frozen.png';
import drinkCategoryIcon from '../../assets/images/drinks.png';
import dairyCategoryIcon from '../../assets/images/dairy.png';
import meatCategoryIcon from '../../assets/images/meat.png';
import bakeryCategoryIcon from '../../assets/images/bakery.png';
import pantryCategoryIcon from '../../assets/images/Pantry.png';
import { HOME_CONTENT_MAX } from './homeCatalog';

const CATEGORY_CHIP_H_PX = 36;
const CATEGORY_ICON_PX = 15;
const CATEGORY_LABEL_FS = 9;
const CATEGORY_GAP = 6;
/** 「More」按钮估算宽度（含与前一 chip 的 gap） */
const CATEGORY_MORE_CONTROL_PX = 102;
const CATEGORY_CHIP_H_PAD_X = 12;
const CATEGORY_CHIP_ICON_TEXT_GAP = 6;

/** 单行展示所需最小宽度（图标 + 间距 + 标签全宽 + 内边距），用于决定主行放几个、其余进 More */
function measureCategoryChipMinWidthPx(label: string): number {
  if (typeof document === 'undefined') {
    return 44 + label.length * 6;
  }
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 44 + label.length * 6;
  ctx.font = `600 ${CATEGORY_LABEL_FS}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const textW = ctx.measureText(label).width;
  return (
    Math.ceil(
      CATEGORY_ICON_PX +
        CATEGORY_CHIP_ICON_TEXT_GAP +
        textW +
        CATEGORY_CHIP_H_PAD_X
    ) + 4
  );
}

const HOME_CATEGORIES: { label: string; value: string; icon?: string }[] = [
  { label: 'All Products', value: 'all' },
  { label: 'Special', value: 'Special', icon: specialCategoryIcon },
  { label: 'Recommended', value: 'Recommended', icon: recommendedCategoryIcon },
  { label: 'Vegetables', value: 'Vegetables', icon: vegetableIcon },
  { label: 'Fruit', value: 'Fruit', icon: fruitIcon },
  { label: 'Grocery', value: 'Grocery', icon: groceryCategoryIcon },
  { label: 'Frozen', value: 'Frozen', icon: frozenCategoryIcon },
  { label: 'Drink', value: 'Drink', icon: drinkCategoryIcon },
  { label: 'Dairy', value: 'Dairy', icon: dairyCategoryIcon },
  { label: 'Meat', value: 'Meat', icon: meatCategoryIcon },
  { label: 'Seafood', value: 'Seafood' },
  { label: 'Bakery', value: 'Bakery', icon: bakeryCategoryIcon },
  { label: 'Pantry', value: 'Pantry', icon: pantryCategoryIcon },
];

const HOME_CATEGORY_CHIP_MIN_WIDTHS = HOME_CATEGORIES.map((c) => measureCategoryChipMinWidthPx(c.label));

/** 主行在「均分宽度」下最多能直接展示几个；其余进 More（保证单行、不按字母断行） */
function computeVisibleMainCount(containerWidth: number, total: number, chipMinWidths: number[]): number {
  const g = CATEGORY_GAP;
  const M = CATEGORY_MORE_CONTROL_PX;
  if (containerWidth <= 0 || total <= 0) return 1;

  const maxMinAll = Math.max(...chipMinWidths);
  const wcIfAll = (containerWidth - (total - 1) * g) / total;
  if (wcIfAll >= maxMinAll) return total;

  for (let n = total - 1; n >= 1; n--) {
    const need = Math.max(...chipMinWidths.slice(0, n));
    const wc = (containerWidth - n * g - M) / n;
    if (wc >= need) return n;
  }
  return 1;
}

function CategoryChipButton({
  cat,
  selectedCategory,
  onSelectCategory,
  chipMinWidthPx,
  rowLayout,
}: {
  cat: (typeof HOME_CATEGORIES)[number];
  selectedCategory: string;
  onSelectCategory: (v: string) => void;
  chipMinWidthPx: number;
  rowLayout: 'equal' | 'intrinsic';
}) {
  const isSelected = selectedCategory === cat.value;
  return (
    <button
      type="button"
      onClick={() => {
        onSelectCategory(selectedCategory === cat.value ? '' : cat.value);
      }}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        boxSizing: 'border-box',
        width: rowLayout === 'equal' ? '100%' : chipMinWidthPx,
        minWidth: rowLayout === 'equal' ? 0 : chipMinWidthPx,
        height: CATEGORY_CHIP_H_PX,
        padding: '3px 5px',
        borderRadius: 8,
        border: isSelected ? '2px solid #dc2626' : '1px solid #e5e7eb',
        backgroundColor: isSelected ? '#fef2f2' : 'white',
        color: isSelected ? '#dc2626' : '#374151',
        fontWeight: 600,
        fontSize: CATEGORY_LABEL_FS,
        cursor: 'pointer',
        lineHeight: 1.1,
        textAlign: 'center',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        wordBreak: 'normal',
        overflowWrap: 'normal',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: CATEGORY_CHIP_ICON_TEXT_GAP,
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {cat.icon ? (
          <img
            src={cat.icon}
            alt=""
            style={{
              width: CATEGORY_ICON_PX,
              height: CATEGORY_ICON_PX,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />
        ) : (
          <AppstoreOutlined
            style={{
              fontSize: CATEGORY_ICON_PX,
              color: isSelected ? '#dc2626' : '#6b7280',
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            wordBreak: 'normal',
            overflowWrap: 'normal',
          }}
        >
          {cat.label}
        </span>
      </span>
    </button>
  );
}

export function HomeCategoryBar({
  selectedCategory,
  onSelectCategory,
}: {
  selectedCategory: string;
  onSelectCategory: (v: string) => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const total = HOME_CATEGORIES.length;
  const [visibleMain, setVisibleMain] = useState(total);
  const [moreExpanded, setMoreExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      if (w <= 0) return;
      const n = computeVisibleMainCount(w, total, HOME_CATEGORY_CHIP_MIN_WIDTHS);
      setVisibleMain(Math.max(1, Math.min(n, total)));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);

  const hidden = React.useMemo(() => HOME_CATEGORIES.slice(visibleMain), [visibleMain]);
  const hasHidden = hidden.length > 0;

  useEffect(() => {
    if (!hasHidden) {
      // Existing category-layout synchronization keeps More collapsed when unused.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional category UI synchronization
      setMoreExpanded(false);
      return;
    }
    if (hidden.some((c) => c.value === selectedCategory)) setMoreExpanded(true);
  }, [selectedCategory, hasHidden, hidden]);

  const moreFilterActive =
    hasHidden && hidden.some((c) => c.value === selectedCategory);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: HOME_CONTENT_MAX,
        margin: '0 auto 1.5rem',
        padding: 'clamp(0.4rem, 1.2vw, 0.6rem) 0',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={measureRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'stretch',
          gap: CATEGORY_GAP,
          width: '100%',
          minHeight: CATEGORY_CHIP_H_PX + 4,
        }}
      >
        {HOME_CATEGORIES.slice(0, visibleMain).map((cat, idx) => (
          <div
            key={cat.label}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            <CategoryChipButton
              cat={cat}
              selectedCategory={selectedCategory}
              onSelectCategory={onSelectCategory}
              chipMinWidthPx={HOME_CATEGORY_CHIP_MIN_WIDTHS[idx]!}
              rowLayout="equal"
            />
          </div>
        ))}
        {hasHidden && (
          <button
            type="button"
            onClick={() => setMoreExpanded((e) => !e)}
            aria-expanded={moreExpanded}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: CATEGORY_CHIP_H_PX,
              padding: '0 10px',
              borderRadius: 8,
              border: moreFilterActive && !moreExpanded ? '2px solid #fca5a5' : '1px solid #e5e7eb',
              background: moreFilterActive && !moreExpanded ? '#fff7ed' : '#fafafa',
              color: '#374151',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {moreExpanded ? <UpOutlined style={{ fontSize: 12 }} /> : <DownOutlined style={{ fontSize: 12 }} />}
            {moreExpanded ? 'Show less' : 'More'}
          </button>
        )}
      </div>

      {hasHidden && moreExpanded && (
        <div
          style={{
            width: '100%',
            marginTop: 10,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              gap: CATEGORY_GAP,
              maxWidth: '100%',
              overflowX: 'auto',
              overflowY: 'hidden',
              paddingBottom: 4,
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
            }}
          >
            {hidden.map((cat, idx) => {
              const ord = visibleMain + idx;
              return (
                <div key={cat.label} style={{ flex: '0 0 auto' }}>
                  <CategoryChipButton
                    cat={cat}
                    selectedCategory={selectedCategory}
                    onSelectCategory={onSelectCategory}
                    chipMinWidthPx={HOME_CATEGORY_CHIP_MIN_WIDTHS[ord]!}
                    rowLayout="intrinsic"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 首页 Special 横条：优先显示后台分类为 Special 的商品；未配置前回退显示前 5 个上架商品，避免整块消失。 */
