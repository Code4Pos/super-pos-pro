import React, { useState, memo } from 'react';
import { Package, Trash2, Edit3, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

/**
 * ProductCard (Minimal & Mobile-Friendly):
 * - ห่อหุ้มด้วย React.memo เพื่อป้องกันการ Re-render การ์ดใบอื่นเมื่อกดเพิ่มสินค้า
 * - สัดส่วนกะทัดรัดบนมือถือ (h-24 sm:h-28) เพื่อให้เห็นสินค้าได้มากขึ้นต่อหน้าจอ
 * - ช่องราคาปลีกและราคาส่งจัดวางสะอาดตา ตัวเลขชัดเจน กดเพิ่มเข้าตะกร้าได้ทันที
 */
function ProductCardComponent({
  product,
  qtyInCart = 0,
  isWholesaleActiveInCart = false,
  onAddToCart,
  onEditQtyNumpad,
  onRequestRemoveFromCart,
}) {
  const [imgError, setImgError] = useState(false);

  const stock = Number(product.stock) || 0;
  const minStock = Number(product.min_stock) || 10;
  const isOutOfStock = stock <= 0;
  const isLowStock = !isOutOfStock && stock <= minStock;

  const retailPrice = Number(product.retail_price) || 0;
  const wholesalePrice = Number(product.wholesale_price) || retailPrice;
  const minWholesaleQty = Number(product.wholesale_min_qty) || 6;
  const hasWholesaleDiscount = wholesalePrice < retailPrice;

  return (
    <div
      className={`bg-white rounded-2xl border flex flex-col overflow-hidden relative select-none ${
        isOutOfStock
          ? 'border-slate-200 opacity-60'
          : qtyInCart > 0
          ? 'border-indigo-600 ring-2 ring-indigo-600/15'
          : 'border-slate-200/90 hover:border-indigo-300'
      }`}
    >
      {/* ส่วนรูปภาพและป้ายสถานะด้านบน */}
      <div
        onClick={() => !isOutOfStock && onAddToCart(product, 1)}
        className={`relative h-24 sm:h-28 bg-slate-100 overflow-hidden ${
          isOutOfStock ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        {product.image_url && !imgError ? (
          <img
            src={product.image_url}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300">
            <Package className="w-8 h-8 stroke-1.5" />
            <span className="text-[10px] font-mono mt-0.5 text-slate-400">
              {product.sku}
            </span>
          </div>
        )}

        {/* ป้าย SKU มุมซ้ายบน */}
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-mono font-medium">
          {product.sku}
        </span>

        {/* มุมขวาบน: แท็กจำนวนสินค้า (กดเพื่อเปิด Numpad แก้ไขได้) + ปุ่มลบสินค้า */}
        {qtyInCart > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10"
          >
            <button
              type="button"
              onClick={() =>
                onEditQtyNumpad && onEditQtyNumpad(product, qtyInCart)
              }
              className={`px-2 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 ${
                isWholesaleActiveInCart
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 text-white'
              }`}
              title="คลิกเพื่อแก้ไขจำนวนสินค้าด้วย Numpad"
            >
              <span>{qtyInCart}</span>
              <Edit3 className="w-2.5 h-2.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                onRequestRemoveFromCart && onRequestRemoveFromCart(product)
              }
              className="w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center"
              title="ลบสินค้านี้ออกจากตะกร้า"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* ป้ายสถานะสต็อก มุมขวาล่างของภาพ */}
        <span
          className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
            isOutOfStock
              ? 'bg-rose-600 text-white'
              : isLowStock
              ? 'bg-amber-500 text-white'
              : 'bg-white/95 text-slate-600 border border-slate-200/80'
          }`}
        >
          {isOutOfStock ? 'หมด' : `${stock} ${product.unit}`}
        </span>
      </div>

      {/* รายละเอียดสินค้า และ ปุ่มราคาปลีก / ราคาส่ง */}
      <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800 text-xs sm:text-sm line-clamp-2 leading-snug">
            {product.name}
          </h3>
          {product.pack_size && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {product.pack_size}
            </p>
          )}
        </div>

        {/* ปุ่มราคาปลีก และ ปุ่มราคาส่ง */}
        <div
          className={`grid ${
            hasWholesaleDiscount ? 'grid-cols-2' : 'grid-cols-1'
          } gap-1.5`}
        >
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={() => onAddToCart(product, 1)}
            className="p-1.5 sm:p-2 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-indigo-600 hover:border-indigo-600 active:bg-indigo-700 group/retail disabled:opacity-50 disabled:pointer-events-none text-left transition-colors"
            title={`คลิกเพื่อเพิ่ม ${product.name} (+1 ${product.unit})`}
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 group-hover/retail:text-indigo-100">
              <span>ปลีก</span>
              <Plus className="w-3 h-3 stroke-[2.5]" />
            </div>
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 group-hover/retail:text-white leading-tight mt-0.5 truncate">
              {formatCurrency(retailPrice)}
            </div>
          </button>

          {hasWholesaleDiscount && (
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() =>
                onAddToCart(product, Math.min(stock, minWholesaleQty))
              }
              className="p-1.5 sm:p-2 rounded-xl border border-emerald-200/90 bg-emerald-50/70 hover:bg-emerald-600 hover:border-emerald-600 active:bg-emerald-700 group/wholesale disabled:opacity-50 disabled:pointer-events-none text-left transition-colors"
              title={`คลิกเพื่อเพิ่มเรตราคาส่ง (+${minWholesaleQty} ${product.unit})`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 group-hover/wholesale:text-emerald-100">
                <span>ส่ง +{minWholesaleQty}</span>
                <Plus className="w-3 h-3 stroke-[2.5]" />
              </div>
              <div className="text-xs sm:text-sm font-extrabold text-emerald-700 group-hover/wholesale:text-white leading-tight mt-0.5 truncate">
                {formatCurrency(wholesalePrice)}
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ProductCard = memo(ProductCardComponent, (prev, next) => {
  return (
    prev.product === next.product &&
    prev.qtyInCart === next.qtyInCart &&
    prev.isWholesaleActiveInCart === next.isWholesaleActiveInCart
  );
});

export default ProductCard;
