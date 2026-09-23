import type { CartItem } from '../../context/CartContext';
import deleteIcon from '../../assets/images/remove.png';
import productImage from '../../assets/images/main.png';
import { resolveProductImageUrl } from '../../utils/imageUrl';

interface CartItemListProps {
  items: CartItem[];
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateExpectedWeightKg: (productId: number, kg: number) => void;
}

export function CartItemList({
  items,
  removeItem,
  updateQuantity,
  updateExpectedWeightKg,
}: CartItemListProps) {
  return (
<div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {items.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999' }}>Cart is empty</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.productId}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '0.75rem 0',
                    borderBottom: '1px solid #f0f0f0',
                    marginBottom: '0.75rem',
                  }}
                >
                  {/* 左侧：商品图 */}
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      flexShrink: 0,
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={resolveProductImageUrl(item.imageUrl, productImage)}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  {/* 右侧：名字 + (价格与加减同行) + 删除在最右 */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 0, fontSize: '0.9rem' }}>{item.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 'bold' }}>
                        ${item.price.toFixed(2)}
                        {item.isWeighingRequired ? '/kg' : ''}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (item.isWeighingRequired && item.expectedWeightKg != null) {
                              const w = item.expectedWeightKg - 0.25;
                              if (w < 0.05 - 1e-9) removeItem(item.productId);
                              else updateExpectedWeightKg(item.productId, Math.round(w * 1000) / 1000);
                            } else {
                              updateQuantity(item.productId, item.quantity - 1);
                            }
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: 'white',
                            border: 'none',
                            borderRight: '1px solid #d1d5db',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                            color: '#333',
                          }}
                        >
                          −
                        </button>
                        <span
                          style={{
                            minWidth: '44px',
                            height: '28px',
                            padding: '0 4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: '1px solid #d1d5db',
                            fontWeight: 'bold',
                            fontSize: item.isWeighingRequired ? '0.72rem' : '0.875rem',
                          }}
                        >
                          {item.isWeighingRequired && item.expectedWeightKg != null
                            ? `${item.expectedWeightKg.toFixed(2)} kg`
                            : item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (item.isWeighingRequired && item.expectedWeightKg != null) {
                              updateExpectedWeightKg(
                                item.productId,
                                Math.round((item.expectedWeightKg + 0.25) * 1000) / 1000
                              );
                            } else {
                              updateQuantity(item.productId, item.quantity + 1);
                            }
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: 'white',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                            color: '#333',
                          }}
                        >
                          +
                        </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img src={deleteIcon} alt="Remove" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
  );
}
