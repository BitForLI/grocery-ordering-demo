import React, { useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { productAPI } from '../api';
import { API_BASE } from '../config/apiEnv';
import productImage from '../assets/images/main.png';
import { resolveProductImageUrl } from '../utils/imageUrl';
import { useMaxWidth } from '../hooks/useMediaQuery';
import { useStorePublicSettings } from '../context/StorePublicSettingsContext';
import { HomeCategoryBar } from '../components/home/HomeCategoryBar';
import { HomeCarousel } from '../components/home/HomeCarousel';
import { ProductCard, SpecialProductList } from '../components/home/HomeProductGrid';
import {
  GRID_GAP,
  HOME_CONTENT_MAX,
  parseUnitPriceOptions,
  pickSpecialStripProducts,
  productMatchesSearchKeyword,
  type Product,
} from '../components/home/homeCatalog';

interface HomePageProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchKeyword: string;
}

export function HomePage({ selectedCategory, onSelectCategory, searchKeyword }: HomePageProps) {
  const isMobile = useMaxWidth(540);
  const isNarrow = useMaxWidth(768);
  const { settings: storeSettings } = useStorePublicSettings();
  const heroSlideUrls = React.useMemo(() => {
    const raw = storeSettings?.homeCarouselImageUrls?.filter((u) => u?.trim()) ?? [];
    return raw
      .map((u) => resolveProductImageUrl(u.trim(), ''))
      .filter((src): src is string => Boolean(src));
  }, [storeSettings?.homeCarouselImageUrls]);
  const [products, setProducts] = useState<Product[]>([]);
  const [specialProducts, setSpecialProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const toastOnceRef = useRef(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setFetchError(null);
        const res = await productAPI.list();
        const raw = Array.isArray(res) ? res : [];
        const list = raw.map((value) => {
          const p = typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)
            : {};
          return {
          id: (p.id ?? p.Id) as number,
          name: (p.name ?? p.Name) as string,
          description: (p.description ?? p.Description ?? '') as string,
          price: Number(p.price ?? p.Price ?? 0),
          category: (p.category ?? p.Category ?? '') as string,
          unit: (p.unit ?? p.Unit ?? '') as string,
          unitPriceOptionsJson: (p.unitPriceOptionsJson ?? p.UnitPriceOptionsJson ?? '[]') as string,
          unitPriceOptions: parseUnitPriceOptions(p),
          imageUrl: (p.imageUrl ?? p.ImageUrl ?? '') as string | undefined,
          isActive: (p.isActive ?? p.IsActive ?? true) as boolean,
          isWeighingRequired: Boolean(p.isWeighingRequired ?? p.IsWeighingRequired),
            defaultExpectedWeightKg:
              p.defaultExpectedWeightKg != null || p.DefaultExpectedWeightKg != null
                ? Number(p.defaultExpectedWeightKg ?? p.DefaultExpectedWeightKg ?? 0)
                : undefined,
          };
        });
        setProducts(list);
        setSpecialProducts(list.length > 0 ? pickSpecialStripProducts(list) : []);
      } catch (e) {
        const msg = (e as Error)?.message ?? 'Failed to load products';
        setFetchError(msg);
        setProducts([]);
        setSpecialProducts([]);
        if (!toastOnceRef.current) {
          toastOnceRef.current = true;
          message.error(`${msg} (${API_BASE})`);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filtered = products.filter((p) => {
    const matchCategory = !selectedCategory || selectedCategory === 'all' || p.category === selectedCategory;
    const kw = searchKeyword.trim();
    if (!kw) return matchCategory;
    return matchCategory && productMatchesSearchKeyword(p, kw);
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>;
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {fetchError && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            fontSize: 14,
            whiteSpace: 'pre-wrap',
          }}
        >
          Could not load products from the server: {fetchError}
        </div>
      )}
      {/* Hero carousel：仅展示后台配置的图；选分类仍保留顶部主图，搜索时隐藏以突出结果 */}
      {!searchKeyword.trim() && heroSlideUrls.length > 0 && (
        <HomeCarousel images={heroSlideUrls} isNarrow={isNarrow} />
      )}

      <div
        style={{
          width: '100%',
          maxWidth: HOME_CONTENT_MAX,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* 分类：窄屏首行 6 个 + More；宽屏流体列数；名称不省略可换行 */}
        <HomeCategoryBar selectedCategory={selectedCategory} onSelectCategory={onSelectCategory} />

        {/* Special 横条：未在搜索时显示；搜索时只展示下方匹配结果 */}
        {!selectedCategory && !searchKeyword.trim() && specialProducts.length > 0 && (
          <div style={{ marginBottom: 'clamp(1.25rem, 4vw, 2.5rem)' }}>
            <SpecialProductList products={specialProducts} productImage={productImage} />
          </div>
        )}

        {/* 商品网格：选分类或有关键词时展示，仅列出 filtered */}
        {(selectedCategory || searchKeyword.trim()) && (
          <div id="search-results" style={{ scrollMarginTop: '1rem' }}>
            <div
              style={{
                display: 'grid',
                alignItems: 'start',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isNarrow ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)',
                gap: GRID_GAP,
                marginTop: '0.5rem',
                width: '100%',
              }}
            >
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} productImage={productImage} />
              ))}
            </div>
            {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#999' }}>No products</div>}
          </div>
        )}
      </div>
    </div>
  );
}
