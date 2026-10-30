import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { posService, normalizeAndSyncProducts } from '../services/posService';
import { printerService } from '../services/printerService';
import { calculateEffectiveUnitPrice } from '../utils/formatters';

export const APP_VERSION = 'version beta 0.1.6';
const HELD_BILLS_STORAGE_KEY = 'siampos_held_bills_v1';

const POSContext = createContext(null);

export function POSProvider({ children }) {
  const [dbMode, setDbMode] = useState('demo');
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [trashedProducts, setTrashedProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);

  // สถานะตะกร้าสินค้าและการคิดเงิน
  const [cart, setCart] = useState([]);
  const [pricingMode, setPricingMode] = useState('auto'); // 'auto' | 'wholesale' | 'retail'
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [billDiscount, setBillDiscount] = useState(0);

  // ระบบคำนวณ VAT 3 รูปแบบ: 'no_vat' | 'vat_in' | 'vat_out'
  const [vatMode, setVatMode] = useState('no_vat');

  // การตั้งค่าเครื่องพิมพ์ความร้อน และ สถานะเครื่องพิมพ์ 3 สถานะ ('ready' | 'warning' | 'error')
  const [printerSettings, setPrinterSettings] = useState(() =>
    printerService.getSettings()
  );
  const [printerStatus, setPrinterStatus] = useState('ready');

  const refreshPrinterStatus = useCallback(async (customSettings = null) => {
    const st = await printerService.checkPrinterStatus(customSettings);
    setPrinterStatus(st);
    return st;
  }, []);

  useEffect(() => {
    const unsub = printerService.subscribeStatus(({ status }) => {
      setPrinterStatus(status);
    });
    printerService.checkPrinterStatus();
    return unsub;
  }, []);

  const updatePrinterSettings = useCallback((newSettings) => {
    const updated = printerService.saveSettings(newSettings);
    setPrinterSettings(updated);
  }, []);

  // รายการพักบิล (Held Bills) บันทึกลง LocalStorage
  const [heldBills, setHeldBills] = useState(() => {
    try {
      const saved = localStorage.getItem(HELD_BILLS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HELD_BILLS_STORAGE_KEY, JSON.stringify(heldBills));
    } catch (e) {
      console.error('Failed to save held bills:', e);
    }
  }, [heldBills]);

  // ระบบแจ้งเตือน Toast
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // โหลดข้อมูลทั้งหมดตอนเริ่มต้น
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await posService.fetchAllData();
      setDbMode(data.mode);
      setCategories(data.categories);
      setUnits(data.units || []);
      setProducts(data.products);
      setTrashedProducts(data.trashedProducts || []);
      setCustomers(data.customers);
      setOrders(data.orders);
    } catch (err) {
      console.error('Error loading POS data:', err);
      showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleSelectCustomer = useCallback(
    (customer) => {
      setSelectedCustomer(customer);
      if (customer?.customer_type === 'wholesale') {
        setPricingMode('wholesale');
        showToast(`เลือกลูกค้าขายส่ง: ${customer.name} (ใช้เรตราคาส่งทั้งบิล)`, 'info');
      } else if (!customer && pricingMode === 'wholesale') {
        setPricingMode('auto');
      }
    },
    [pricingMode, showToast]
  );

  /**
   * เพิ่มสินค้าลงตะกร้า (version beta 0.1.3):
   * สินค้าที่เพิ่มใหม่ (หรือเพิ่งกดเพิ่มจำนวน) จะถูกดันขึ้นมาอยู่ด้านบนสุดของตะกร้าเสมอ (Index 0)
   */
  const addToCart = useCallback(
    (product, addQty = 1) => {
      if (!product) return;
      const currentStock = Number(product.stock) || 0;
      if (currentStock <= 0) {
        showToast(`สินค้า "${product.name}" หมดสต็อก!`, 'error');
        return;
      }

      setCart((prev) => {
        const existingIndex = prev.findIndex((item) => item.product.id === product.id);
        if (existingIndex > -1) {
          const existing = prev[existingIndex];
          const nextQty = existing.quantity + addQty;
          const finalQty =
            nextQty > currentStock ? currentStock : nextQty;
          if (nextQty > currentStock) {
            showToast(`มีสต็อกคงเหลือเพียง ${currentStock} ${product.unit}`, 'warning');
          }
          const updatedItem = { ...existing, quantity: finalQty };
          // ดันรายการที่เพิ่งเพิ่มขึ้นมาอยู่ด้านบนสุดของตะกร้า
          return [
            updatedItem,
            ...prev.filter((_, idx) => idx !== existingIndex),
          ];
        } else {
          const safeQty = Math.min(addQty, currentStock);
          // เพิ่มสินค้าใหม่อยู่ด้านบนสุดของตะกร้า
          return [
            { product, quantity: safeQty, customPrice: null },
            ...prev,
          ];
        }
      });
    },
    [showToast]
  );

  // ปรับจำนวนสินค้าในตะกร้า
  const updateCartQty = useCallback(
    (productId, newQty) => {
      const parsedQty = Math.floor(Number(newQty));
      if (parsedQty <= 0) {
        setCart((prev) => prev.filter((item) => item.product.id !== productId));
        return;
      }

      setCart((prev) =>
        prev.map((item) => {
          if (item.product.id !== productId) return item;
          const maxStock = Number(item.product.stock) || 0;
          if (parsedQty > maxStock) {
            showToast(`สต็อกคงเหลือสูงสุด ${maxStock} ${item.product.unit}`, 'warning');
            return { ...item, quantity: maxStock };
          }
          return { ...item, quantity: parsedQty };
        })
      );
    },
    [showToast]
  );

  // แก้ไขราคาต่อหน่วยของสินค้าในบิลปัจจุบัน (ผ่าน Numpad)
  const updateCartItemPrice = useCallback(
    (productId, newPrice) => {
      const parsedPrice = Math.max(0, Number(newPrice) || 0);
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId
            ? { ...item, customPrice: parsedPrice }
            : item
        )
      );
      showToast('อัปเดตราคาสินค้าในบิลเรียบร้อย', 'info');
    },
    [showToast]
  );

  const resetCartItemPrice = useCallback((productId) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, customPrice: null } : item
      )
    );
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setBillDiscount(0);
    setPricingMode('auto');
  }, []);

  // คำนวณรายละเอียดราคาปลีก-ส่ง และ VAT ทั้ง 3 รูปแบบ (no_vat, vat_in, vat_out)
  const cartSummary = useMemo(() => {
    let totalItemsCount = 0;
    let retailTotalBeforeTier = 0;
    let subtotal = 0;
    let wholesaleSavings = 0;
    let totalCost = 0;

    const productMap = new Map(products.map((p) => [p.id, p]));

    const enrichedItems = cart.map(({ product, quantity, customPrice }) => {
      const latestProd = productMap.get(product.id) || product;
      const priceCalc = calculateEffectiveUnitPrice(latestProd, quantity, pricingMode);

      const hasCustomPrice = customPrice !== null && customPrice !== undefined;
      const effectiveUnitPrice = hasCustomPrice ? Number(customPrice) : priceCalc.unitPrice;
      const isWholesaleApplied = !hasCustomPrice && priceCalc.isWholesale;

      const itemSubtotal = effectiveUnitPrice * quantity;
      const itemRetailTotal = (Number(latestProd.retail_price) || 0) * quantity;
      const itemSavings = Math.max(0, itemRetailTotal - itemSubtotal);
      const itemCost = (Number(latestProd.cost_price) || 0) * quantity;

      totalItemsCount += quantity;
      retailTotalBeforeTier += itemRetailTotal;
      subtotal += itemSubtotal;
      wholesaleSavings += itemSavings;
      totalCost += itemCost;

      return {
        product_id: latestProd.id,
        sku: latestProd.sku,
        barcode: latestProd.barcode,
        product_name: latestProd.name,
        unit: latestProd.unit,
        image_url: latestProd.image_url,
        current_stock: latestProd.stock,
        linked_product_id: latestProd.linked_product_id || null,
        linked_deduct_qty: latestProd.linked_deduct_qty || 1,
        wholesale_min_qty: latestProd.wholesale_min_qty,
        wholesale_price: Number(latestProd.wholesale_price) || 0,
        quantity,
        unit_price: effectiveUnitPrice,
        custom_price: hasCustomPrice ? Number(customPrice) : null,
        is_custom_price: hasCustomPrice,
        original_retail_price: Number(latestProd.retail_price) || 0,
        cost_price: Number(latestProd.cost_price) || 0,
        is_wholesale_applied: isWholesaleApplied,
        savings_per_unit: isWholesaleApplied
          ? priceCalc.savingsPerUnit
          : Math.max(0, (Number(latestProd.retail_price) || 0) - effectiveUnitPrice),
        qty_to_unlock_wholesale: priceCalc.qtyToUnlockWholesale,
        subtotal: itemSubtotal,
      };
    });

    const safeDiscount = Math.min(subtotal, Math.max(0, Number(billDiscount) || 0));
    const afterDiscount = Math.max(0, subtotal - safeDiscount);

    let taxAmount = 0;
    let netBeforeVat = afterDiscount;
    let grandTotal = afterDiscount;

    if (vatMode === 'vat_in') {
      taxAmount = Number(((afterDiscount * 7) / 107).toFixed(2));
      netBeforeVat = Number((afterDiscount - taxAmount).toFixed(2));
      grandTotal = Number(afterDiscount.toFixed(2));
    } else if (vatMode === 'vat_out') {
      netBeforeVat = Number(afterDiscount.toFixed(2));
      taxAmount = Number((afterDiscount * 0.07).toFixed(2));
      grandTotal = Number((afterDiscount + taxAmount).toFixed(2));
    } else {
      taxAmount = 0;
      netBeforeVat = Number(afterDiscount.toFixed(2));
      grandTotal = Number(afterDiscount.toFixed(2));
    }

    return {
      items: enrichedItems,
      totalItemsCount,
      retailTotalBeforeTier,
      subtotal,
      wholesaleSavings,
      billDiscount: safeDiscount,
      vatMode,
      netBeforeVat,
      taxAmount,
      grandTotal,
      totalCost,
    };
  }, [cart, products, pricingMode, billDiscount, vatMode]);

  // ฟังก์ชันพักบิลอัตโนมัติทันทีที่กดปุ่ม "พักบิล"
  const holdCurrentBill = useCallback(
    (customTitle = '') => {
      if (cart.length === 0) {
        return null;
      }
      const timeStr = new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const defaultTitle =
        customTitle.trim() ||
        (selectedCustomer
          ? `บิลพัก - ${selectedCustomer.name} (${timeStr})`
          : `บิลพัก #${heldBills.length + 1} (${timeStr})`);

      const newHeldBill = {
        id: `hold-${Date.now()}`,
        title: defaultTitle,
        cart,
        selectedCustomer,
        pricingMode,
        billDiscount,
        vatMode,
        grandTotal: cartSummary.grandTotal,
        totalItemsCount: cartSummary.totalItemsCount,
        created_at: new Date().toISOString(),
      };

      setHeldBills((prev) => [newHeldBill, ...prev]);
      clearCart();
      showToast(`บันทึกพักบิล "${defaultTitle}" อัตโนมัติแล้ว`, 'info');
      return newHeldBill;
    },
    [
      cart,
      selectedCustomer,
      pricingMode,
      billDiscount,
      vatMode,
      cartSummary,
      heldBills.length,
      clearCart,
      showToast,
    ]
  );

  // แก้ไขชื่อบิลที่พักไว้
  const updateHeldBillName = useCallback(
    (holdId, newTitle) => {
      if (!newTitle.trim()) return;
      setHeldBills((prev) =>
        prev.map((b) => (b.id === holdId ? { ...b, title: newTitle.trim() } : b))
      );
      showToast('แก้ไขชื่อบิลพักเรียบร้อยแล้ว', 'success');
    },
    [showToast]
  );

  // เรียกบิลที่พักไว้กลับมาขายต่อ
  const recallHeldBill = useCallback(
    (holdId) => {
      const target = heldBills.find((b) => b.id === holdId);
      if (!target) return;

      if (cart.length > 0) {
        const autoHold = {
          id: `hold-${Date.now()}`,
          title: selectedCustomer
            ? `บิลสลับพัก - ${selectedCustomer.name}`
            : `บิลสลับพักอัตโนมัติ`,
          cart,
          selectedCustomer,
          pricingMode,
          billDiscount,
          vatMode,
          grandTotal: cartSummary.grandTotal,
          totalItemsCount: cartSummary.totalItemsCount,
          created_at: new Date().toISOString(),
        };
        setHeldBills((prev) => [autoHold, ...prev.filter((b) => b.id !== holdId)]);
      } else {
        setHeldBills((prev) => prev.filter((b) => b.id !== holdId));
      }

      setCart(target.cart || []);
      setSelectedCustomer(target.selectedCustomer || null);
      setPricingMode(target.pricingMode || 'auto');
      setBillDiscount(target.billDiscount || 0);
      setVatMode(target.vatMode || 'no_vat');
      showToast(`เรียกบิล "${target.title}" กลับมาขายต่อแล้ว`, 'success');
    },
    [
      heldBills,
      cart,
      selectedCustomer,
      pricingMode,
      billDiscount,
      vatMode,
      cartSummary,
      showToast,
    ]
  );

  const deleteHeldBill = useCallback(
    (holdId) => {
      setHeldBills((prev) => prev.filter((b) => b.id !== holdId));
      showToast('ลบบิลที่พักไว้เรียบร้อยแล้ว', 'info');
    },
    [showToast]
  );

  // บันทึกการขาย (Checkout)
  const checkoutOrder = useCallback(
    async ({ payment_method, cash_received, note }) => {
      if (cartSummary.items.length === 0) {
        showToast('ไม่มีสินค้าในตะกร้า', 'error');
        return null;
      }

      const cashVal = Number(cash_received) || cartSummary.grandTotal;
      const changeVal = Math.max(0, cashVal - cartSummary.grandTotal);

      const orderPayload = {
        customer: selectedCustomer,
        pricing_mode: pricingMode,
        subtotal: cartSummary.subtotal,
        wholesale_savings: cartSummary.wholesaleSavings,
        bill_discount: cartSummary.billDiscount,
        vat_mode: vatMode,
        net_before_vat: cartSummary.netBeforeVat,
        tax_amount: cartSummary.taxAmount,
        grand_total: cartSummary.grandTotal,
        total_cost: cartSummary.totalCost,
        payment_method,
        cash_received: cashVal,
        change_amount: changeVal,
        note,
        items: cartSummary.items,
      };

      const { savedOrder, updatedProducts } = await posService.createOrder(
        orderPayload,
        dbMode === 'supabase'
      );
      const enrichedSavedOrder = {
        ...savedOrder,
        vat_mode: vatMode,
        net_before_vat: cartSummary.netBeforeVat,
      };

      setOrders((prev) => [enrichedSavedOrder, ...prev]);
      if (updatedProducts) {
        setProducts(updatedProducts);
      }

      if (selectedCustomer?.id) {
        setCustomers((prev) =>
          prev.map((c) => {
            if (c.id !== selectedCustomer.id) return c;
            const newSpent = (Number(c.total_spent) || 0) + cartSummary.grandTotal;
            return {
              ...c,
              total_spent: newSpent,
              order_count: (Number(c.order_count) || 0) + 1,
              points: Math.floor(newSpent / 100),
            };
          })
        );
      }

      clearCart();
      showToast(`บันทึกบิล ${savedOrder.order_number} สำเร็จ!`, 'success');
      return enrichedSavedOrder;
    },
    [cartSummary, selectedCustomer, pricingMode, vatMode, dbMode, clearCart, showToast]
  );

  // เพิ่ม/แก้ไขสินค้า (ซิงค์สต็อกสินค้าสัมพันธ์อัตโนมัติ)
  const saveProduct = useCallback(
    async (productData) => {
      const saved = await posService.upsertProduct(productData, dbMode === 'supabase');
      setProducts((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        const nextList = exists
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [saved, ...prev];
        return normalizeAndSyncProducts(nextList);
      });
      showToast(
        productData.id
          ? `อัปเดตสินค้า "${saved.name}" เรียบร้อย`
          : `เพิ่มสินค้า "${saved.name}" เรียบร้อย`,
        'success'
      );
      return saved;
    },
    [dbMode, showToast]
  );

  // ลบสินค้า -> ย้ายไปไว้ในถังขยะ (Trash) และยกเลิกการเชื่อมสินค้าสัมพันธ์ในสินค้ารองที่เชื่อมกับสินค้านี้
  const deleteProduct = useCallback(
    async (productId) => {
      const result = await posService.moveProductToTrash(
        productId,
        dbMode === 'supabase'
      );
      if (result.updatedProducts) {
        setProducts(result.updatedProducts);
      }
      if (result.trashedItem) {
        setTrashedProducts((prev) => [
          result.trashedItem,
          ...prev.filter((t) => t.id !== productId),
        ]);
      }
      setCart((prev) => prev.filter((item) => item.product.id !== productId));

      if (result.unlinkedCount > 0) {
        showToast(
          `ย้ายสินค้าลงถังขยะแล้ว และยกเลิกการเชื่อมสินค้าสัมพันธ์ในสินค้ารอง ${result.unlinkedCount} รายการ`,
          'warning'
        );
      } else {
        showToast('ย้ายรายการสินค้าไปยังถังขยะเรียบร้อยแล้ว', 'info');
      }
    },
    [dbMode, showToast]
  );

  // กู้คืนสินค้าจากถังขยะ
  const restoreProductFromTrash = useCallback(
    async (productId) => {
      const result = await posService.restoreProductFromTrash(productId);
      if (!result) return null;
      setProducts(result.updatedProducts);
      setTrashedProducts(result.updatedTrash);
      showToast(
        `กู้คืนสินค้า "${result.restoredProduct?.name || ''}" กลับเข้าคลังแล้ว`,
        'success'
      );
      return result.restoredProduct;
    },
    [showToast]
  );

  // ลบสินค้าในถังขยะแบบถาวร
  const permanentDeleteProduct = useCallback(
    async (productId) => {
      const result = await posService.permanentDeleteProduct(
        productId,
        dbMode === 'supabase'
      );
      setTrashedProducts(result.updatedTrash);
      setProducts(result.updatedProducts);
      showToast('ลบสินค้าออกจากถังขยะอย่างถาวรแล้ว', 'info');
    },
    [dbMode, showToast]
  );

  // ล้างถังขยะทั้งหมดแบบถาวร
  const emptyTrash = useCallback(async () => {
    await posService.emptyTrash(dbMode === 'supabase');
    setTrashedProducts([]);
    showToast('ล้างถังขยะทั้งหมดอย่างถาวรเรียบร้อยแล้ว', 'info');
  }, [dbMode, showToast]);

  // ปรับสต็อกด่วน (ซิงค์สต็อกและราคาต้นทุนไปยังสินค้ารองที่เชื่อมสินค้าสัมพันธ์)
  const updateProductStock = useCallback(
    async (productId, newStock, newCostPrice = undefined) => {
      const syncedList = await posService.updateStock(
        productId,
        newStock,
        dbMode === 'supabase',
        newCostPrice
      );
      setProducts(syncedList);
      const updated = syncedList.find((p) => p.id === productId);
      if (updated) {
        showToast(
          `อัปเดตสต็อก "${updated.name}" เป็น ${updated.stock} ${updated.unit} เรียบร้อย`,
          'success'
        );
      }
      return updated;
    },
    [dbMode, showToast]
  );

  // เพิ่มหมวดหมู่สินค้า
  const addCategory = useCallback(
    async (catData) => {
      const saved = await posService.addCategory(catData, dbMode === 'supabase');
      setCategories((prev) => [...prev, saved]);
      showToast(`เพิ่มหมวดหมู่ "${saved.name}" สำเร็จ`, 'success');
      return saved;
    },
    [dbMode, showToast]
  );

  // แก้ไขหมวดหมู่สินค้า
  const updateCategory = useCallback(
    async (categoryId, catData) => {
      const updated = await posService.updateCategory(
        categoryId,
        catData,
        dbMode === 'supabase'
      );
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name: updated.name } : c))
      );
      showToast(`แก้ไขหมวดหมู่เป็น "${updated.name}" สำเร็จ`, 'success');
      return updated;
    },
    [dbMode, showToast]
  );

  // ลบหมวดหมู่สินค้า
  const deleteCategory = useCallback(
    async (categoryId) => {
      if (categoryId === 'all') return;
      await posService.deleteCategory(categoryId, dbMode === 'supabase');
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      showToast('ลบหมวดหมู่สินค้าเรียบร้อยแล้ว', 'info');
    },
    [dbMode, showToast]
  );

  // เพิ่มหน่วยนับสินค้า
  const addUnit = useCallback(
    async (unitData) => {
      const saved = await posService.addUnit(unitData);
      setUnits((prev) => {
        if (prev.some((u) => u.id === saved.id)) return prev;
        return [...prev, saved];
      });
      showToast(`เพิ่มหน่วยนับ "${saved.name}" สำเร็จ`, 'success');
      return saved;
    },
    [showToast]
  );

  // แก้ไขหน่วยนับสินค้า
  const updateUnit = useCallback(
    async (unitId, unitData) => {
      const updated = await posService.updateUnit(unitId, unitData);
      setUnits((prev) =>
        prev.map((u) => (u.id === unitId ? { ...u, name: updated.name } : u))
      );
      if (updated.oldName && updated.oldName !== updated.name) {
        setProducts((prev) =>
          prev.map((p) => ({
            ...p,
            unit: p.unit === updated.oldName ? updated.name : p.unit,
            selling_units: Array.isArray(p.selling_units)
              ? p.selling_units.map((su) =>
                  su.unit === updated.oldName
                    ? { ...su, unit: updated.name }
                    : su
                )
              : [],
          }))
        );
      }
      showToast(`แก้ไขหน่วยนับเป็น "${updated.name}" สำเร็จ`, 'success');
      return updated;
    },
    [showToast]
  );

  // ลบหน่วยนับสินค้า
  const deleteUnit = useCallback(
    async (unitId) => {
      await posService.deleteUnit(unitId);
      setUnits((prev) => prev.filter((u) => u.id !== unitId));
      showToast('ลบหน่วยนับเรียบร้อยแล้ว', 'info');
    },
    [showToast]
  );

  // เพิ่ม/แก้ไขลูกค้า
  const saveCustomer = useCallback(
    async (customerData) => {
      const saved = await posService.upsertCustomer(customerData, dbMode === 'supabase');
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === saved.id);
        if (exists) {
          return prev.map((c) => (c.id === saved.id ? saved : c));
        }
        return [saved, ...prev];
      });
      showToast(`บันทึกข้อมูลลูกค้า "${saved.name}" สำเร็จ`, 'success');
      return saved;
    },
    [dbMode, showToast]
  );

  // ยกเลิกบิลและคืนสต็อก
  const voidOrder = useCallback(
    async (order) => {
      const { updatedOrder, updatedProducts } = await posService.voidOrder(
        order,
        products,
        dbMode === 'supabase'
      );
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
      if (updatedProducts) {
        setProducts(updatedProducts);
      }
      showToast(`ยกเลิกบิล ${order.order_number} และคืนสต็อกสินค้าแล้ว`, 'warning');
    },
    [products, dbMode, showToast]
  );

  const resetDemo = useCallback(async () => {
    posService.resetDemoData();
    await refreshData();
    clearCart();
    showToast('รีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นเรียบร้อย', 'info');
  }, [refreshData, clearCart, showToast]);

  const value = {
    appVersion: APP_VERSION,
    dbMode,
    loading,
    categories,
    units,
    products,
    trashedProducts,
    customers,
    orders,
    cart,
    pricingMode,
    setPricingMode,
    selectedCustomer,
    selectCustomer: handleSelectCustomer,
    billDiscount,
    setBillDiscount,
    vatMode,
    setVatMode,
    printerSettings,
    updatePrinterSettings,
    printerStatus,
    refreshPrinterStatus,
    cartSummary,
    addToCart,
    updateCartQty,
    updateCartItemPrice,
    resetCartItemPrice,
    removeFromCart,
    clearCart,
    heldBills,
    holdCurrentBill,
    updateHeldBillName,
    recallHeldBill,
    deleteHeldBill,
    checkoutOrder,
    saveProduct,
    deleteProduct,
    restoreProductFromTrash,
    permanentDeleteProduct,
    emptyTrash,
    updateProductStock,
    addCategory,
    updateCategory,
    deleteCategory,
    addUnit,
    updateUnit,
    deleteUnit,
    saveCustomer,
    voidOrder,
    refreshData,
    resetDemo,
    toast,
    showToast,
  };

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}
