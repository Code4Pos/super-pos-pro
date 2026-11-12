import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { posService, normalizeAndSyncProducts } from '../services/posService';
import { printerService } from '../services/printerService';
import { calculateEffectiveUnitPrice } from '../utils/formatters';
import { summarizeSplitPayments } from '../utils/payments';
import { calculateCustomerCredit, checkCreditSale } from '../utils/credit';
import { hasPermission, canAccessTab } from '../utils/rbac';
import { validateTransfer } from '../utils/warehouses';
import {
  calculateReservedByProduct,
  validateSalesOrderItems,
  buildSalesOrderItems,
} from '../utils/salesOrders';

const SESSION_STORAGE_KEY = 'siampos_session_v1';

export const APP_VERSION = 'version beta 0.3.4';
const HELD_BILLS_STORAGE_KEY = 'siampos_held_bills_v1';

const POSContext = createContext(null);

export function POSProvider({ children }) {
  const [dbMode, setDbMode] = useState('demo');
  const [loading, setLoading] = useState(true);
  // โหมดออฟไลน์: เน็ตหลุด หรือเปิดแอปด้วยแคชเพราะเชื่อม Supabase ไม่ได้
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => posService.getOfflineQueue().length);
  const [syncing, setSyncing] = useState(false);

  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [trashedProducts, setTrashedProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [billingNotes, setBillingNotes] = useState([]);
  const [stockLedger, setStockLedger] = useState([]);
  const [taxInvoices, setTaxInvoices] = useState([]);
  const [taxNotes, setTaxNotes] = useState([]);
  const [stockCounts, setStockCounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [inventoryBalances, setInventoryBalances] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  // ใบสั่งขายที่ถูกเปิดเข้าตะกร้า (ปิดใบอัตโนมัติเมื่อชำระเงินสำเร็จ)
  const [activeSalesOrder, setActiveSalesOrder] = useState(null);
  const activeSalesOrderRef = useRef(null);
  activeSalesOrderRef.current = activeSalesOrder;
  const [productLots, setProductLots] = useState([]);

  // ผู้ใช้งานและสิทธิ์ (RBAC): ถ้ายังไม่มีผู้ใช้ที่เปิดใช้งาน ระบบจะเปิดทุกเมนูแบบไม่ต้องล็อกอิน
  // โหลดรายชื่อผู้ใช้จากเครื่องทันที เพื่อไม่ให้หน้าจอเปิดทุกเมนูชั่วขณะก่อนโหลดข้อมูลเสร็จ
  const [users, setUsers] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('siampos_users_v1') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [sessionUserId, setSessionUserId] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null')?.userId || null;
    } catch {
      return null;
    }
  });
  const authEnabled = users.some((u) => u.is_active);
  const currentUser = authEnabled
    ? users.find((u) => u.id === sessionUserId && u.is_active) || null
    : null;
  const [suppliers, setSuppliers] = useState([]);
  const [stockImports, setStockImports] = useState([]);
  const [orders, setOrders] = useState([]);
  const [wholesaleRules, setWholesaleRules] = useState([]);
  const [specialRules, setSpecialRules] = useState([]);

  // สถานะตะกร้าสินค้าและการคิดเงิน
  const [cart, setCart] = useState([]);
  const [pricingMode, setPricingMode] = useState('auto'); // 'auto' | 'wholesale' | 'retail'
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [billDiscount, setBillDiscount] = useState(0);

  // การตั้งค่าระบบ (เครื่องพิมพ์, ร้าน, ภาษี, การชำระเงิน) และ สถานะเครื่องพิมพ์ 3 สถานะ ('ready' | 'warning' | 'error')
  const [printerSettings, setPrinterSettings] = useState(() =>
    printerService.getSettings()
  );

  // ระบบคำนวณ VAT 3 รูปแบบ: 'no_vat' | 'vat_in' | 'vat_out' (ตั้งค่าครั้งเดียวที่หน้าตั้งค่า › ภาษี ใช้กับทุกบิล)
  const vatMode = printerSettings.vatMode || 'no_vat';
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

  const setVatMode = useCallback(
    (mode) => updatePrinterSettings({ vatMode: mode }),
    [updatePrinterSettings]
  );

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
      setIsOffline(Boolean(data.offline) || (typeof navigator !== 'undefined' && navigator.onLine === false));
      setPendingSyncCount(posService.getOfflineQueue().length);
      setCategories(data.categories);
      setUnits(data.units || []);
      setProducts(data.products);
      setTrashedProducts(data.trashedProducts || []);
      setCustomers(data.customers);
      setCustomerPayments(data.customerPayments || []);
      setBillingNotes(data.billingNotes || []);
      setStockLedger(data.stockLedger || []);
      setTaxInvoices(data.taxInvoices || []);
      setTaxNotes(data.taxNotes || []);
      setStockCounts(data.stockCounts || []);
      setWarehouses(data.warehouses || []);
      setInventoryBalances(data.inventoryBalances || []);
      setStockTransfers(data.stockTransfers || []);
      setSalesOrders(data.salesOrders || []);
      setProductLots(data.productLots || []);
      setUsers(data.users || []);
      setSuppliers(data.suppliers || []);
      setStockImports(data.stockImports || []);
      setOrders(data.orders);
      setWholesaleRules(data.wholesaleRules || []);
      setSpecialRules(data.specialRules || []);
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
    setActiveSalesOrder(null);
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
      const priceCalc = calculateEffectiveUnitPrice(
        latestProd,
        quantity,
        pricingMode,
        wholesaleRules,
        specialRules,
        cart,
        selectedCustomer
      );

      const hasCustomPrice = customPrice !== null && customPrice !== undefined;
      const effectiveUnitPrice = hasCustomPrice ? Number(customPrice) : priceCalc.unitPrice;
      const isWholesaleApplied = !hasCustomPrice && priceCalc.isWholesale;
      const priceSource = hasCustomPrice ? 'custom' : priceCalc.priceSource;
      const priceLabel = hasCustomPrice ? 'กำหนดราคาเอง' : priceCalc.priceLabel;

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
        price_source: priceSource,
        price_label: priceLabel,
        tier_label: priceLabel,
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
  }, [
    cart,
    products,
    pricingMode,
    billDiscount,
    vatMode,
    wholesaleRules,
    specialRules,
    selectedCustomer,
  ]);

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
      setActiveSalesOrder(null);
      setSelectedCustomer(target.selectedCustomer || null);
      setPricingMode(target.pricingMode || 'auto');
      setBillDiscount(target.billDiscount || 0);
      // รูปแบบ VAT ใช้ค่าจากหน้าตั้งค่าเสมอ ไม่เปลี่ยนตามบิลที่พักไว้
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

  // สรุปเครดิตลูกค้า: ยอดค้างชำระ วงเงินคงเหลือ และยอดเกินกำหนด
  const getCustomerCredit = useCallback(
    (customer) => calculateCustomerCredit(customer, orders, customerPayments),
    [orders, customerPayments]
  );

  // บันทึกการขาย (Checkout)
  const checkoutOrder = useCallback(
    async ({ payment_method, cash_received, note, payments = null }) => {
      if (cartSummary.items.length === 0) {
        showToast('ไม่มีสินค้าในตะกร้า', 'error');
        return null;
      }

      // เตือน (ไม่บล็อก) เมื่อขายเกินยอดพร้อมขาย ATP เพราะไปใช้สต็อกที่ลูกค้าส่งจองไว้
      const reservedForOthers = calculateReservedByProduct(salesOrders, activeSalesOrderRef.current?.id);
      if (Object.keys(reservedForOthers).length > 0) {
        // รวมสินค้าหลักกับสินค้ารองตัวเดียวกันก่อนเทียบ ATP
        const atpError = validateSalesOrderItems(
          cartSummary.items.map((item) => ({ product_id: item.product_id, qty: item.quantity })),
          products,
          reservedForOthers
        );
        if (atpError) showToast(`ขายเกินยอดที่ลูกค้าส่งจองไว้: ${atpError}`, 'warning');
      }

      let finalMethod = payment_method;
      let cashVal = Number(cash_received) || cartSummary.grandTotal;
      let changeVal = Math.max(0, cashVal - cartSummary.grandTotal);
      let orderPayments = [{ method: payment_method, amount: cartSummary.grandTotal }];

      // แบ่งจ่ายหลายช่องทาง: บันทึกยอดที่ใช้ชำระจริงต่อช่องทาง (เงินสดหักเงินทอนแล้ว)
      if (Array.isArray(payments) && payments.length > 0) {
        const split = summarizeSplitPayments(payments, cartSummary.grandTotal);
        if (!split.isComplete) {
          showToast('ยอดชำระแต่ละช่องทางยังไม่ครบยอดสุทธิ', 'error');
          return null;
        }
        const amountByMethod = new Map();
        payments.forEach((p) => {
          const amt = Number(p.amount) || 0;
          if (amt > 0) amountByMethod.set(p.method, (amountByMethod.get(p.method) || 0) + amt);
        });
        if (amountByMethod.has('cash')) {
          amountByMethod.set('cash', amountByMethod.get('cash') - split.change);
        }
        orderPayments = [...amountByMethod.entries()]
          .map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100 }))
          .filter((p) => p.amount > 0);
        finalMethod = orderPayments.length > 1 ? 'split' : orderPayments[0]?.method || 'cash';
        cashVal = split.cashTotal;
        changeVal = split.change;
      }

      // ตรวจสอบวงเงินเครดิต (Credit Limit Check) ก่อนยืนยันการขายเชื่อ
      const creditAmount = orderPayments
        .filter((p) => p.method === 'credit')
        .reduce((sum, p) => sum + p.amount, 0);
      let creditDueDate = null;
      if (creditAmount > 0) {
        const creditCheck = checkCreditSale(
          selectedCustomer,
          creditAmount,
          getCustomerCredit(selectedCustomer)
        );
        if (!creditCheck.ok) {
          showToast(creditCheck.message, 'error');
          return null;
        }
        const due = new Date();
        due.setDate(due.getDate() + (Number(selectedCustomer.credit_term_days) || 0));
        creditDueDate = due.toISOString();
      }

      const orderPayload = {
        credit_due_date: creditDueDate,
        created_by_name: currentUser?.name || '',
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
        payment_method: finalMethod,
        payments: orderPayments,
        cash_received: cashVal,
        change_amount: changeVal,
        note,
        items: cartSummary.items,
      };

      const { savedOrder, updatedProducts } = await posService.createOrder(
        orderPayload,
        dbMode === 'supabase'
      );
      // บิลที่บันทึกตอนออฟไลน์จะเข้าคิวรอซิงค์
      setPendingSyncCount(posService.getOfflineQueue().length);
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

      // ปิดใบสั่งขายที่เปิดเข้าตะกร้า (ยอดจองหายไป เพราะสต็อกถูกตัดจากบิลนี้แล้ว)
      const linkedSalesOrder = activeSalesOrderRef.current;
      if (linkedSalesOrder) {
        try {
          const result = await posService.saveSalesOrder(
            {
              ...linkedSalesOrder,
              status: 'fulfilled',
              order_number: savedOrder.order_number,
              fulfilled_by_name: currentUser?.name || '',
              fulfilled_at: new Date().toISOString(),
            },
            dbMode === 'supabase'
          );
          setSalesOrders(result.salesOrders);
        } catch (err) {
          showToast(err.message, 'warning');
        }
      }

      clearCart();
      showToast(`บันทึกบิล ${savedOrder.order_number} สำเร็จ!`, 'success');

      // เปิดลิ้นชักเก็บเงินอัตโนมัติเมื่อบิลนี้รับเงินสด (ไม่รอผล เพื่อไม่ให้หน้าขายช้า)
      if (printerSettings.cashDrawerEnabled && orderPayments.some((p) => p.method === 'cash')) {
        printerService.openCashDrawer(printerSettings).then((result) => {
          if (!result.ok) showToast(result.message, 'warning');
        });
      }
      return enrichedSavedOrder;
    },
    [
      cartSummary,
      selectedCustomer,
      pricingMode,
      vatMode,
      dbMode,
      clearCart,
      showToast,
      printerSettings,
      getCustomerCredit,
      currentUser,
      salesOrders,
      products,
    ]
  );

  // เพิ่ม/แก้ไขสินค้า (ซิงค์สต็อกสินค้าสัมพันธ์อัตโนมัติ)
  const saveProduct = useCallback(
    async (productData) => {
      const saved = await posService.upsertProduct(
        productData,
        dbMode === 'supabase',
        products
      );
      setProducts((prev) => {
        let baseList = prev;
        if (productData.sync_master_stock && productData.linked_product_id) {
          const masterId = productData.linked_product_id;
          const deductQty = Math.max(1, Number(productData.linked_deduct_qty) || 1);
          baseList = baseList.map((p) => {
            if (p.id !== masterId) return p;
            const currentMasterStock = Number(p.stock) || 0;
            const remainder = currentMasterStock % deductQty;
            const nextMasterStock = Math.max(
              0,
              (Number(productData.stock) || 0) * deductQty + remainder
            );
            return { ...p, stock: nextMasterStock };
          });
        }
        const exists = baseList.some((p) => p.id === saved.id);
        const nextList = exists
          ? baseList.map((p) => (p.id === saved.id ? saved : p))
          : [saved, ...baseList];
        return normalizeAndSyncProducts(nextList);
      });
      setWholesaleRules(posService.getWholesaleRulesLocal());
      showToast(
        productData.id
          ? `อัปเดตสินค้า "${saved.name}" เรียบร้อย`
          : `เพิ่มสินค้า "${saved.name}" เรียบร้อย`,
        'success'
      );
      return saved;
    },
    [dbMode, products, showToast]
  );

  // ลบสินค้า -> ย้ายไปไว้ในถังขยะ (Trash) และยกเลิกการเชื่อมสินค้าสัมพันธ์ในสินค้ารองที่เชื่อมกับสินค้านี้
  const deleteProduct = useCallback(
    async (productId) => {
      const result = await posService.moveProductToTrash(
        productId,
        dbMode === 'supabase',
        products
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
    [dbMode, products, showToast]
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

  // ปรับสต็อกด่วน (ซิงค์สต็อกและราคาต้นทุนไปยังสินค้ารองที่เชื่อมสินค้าสัมพันธ์ โดยใช้รายการสินค้าปัจจุบันเสมอเพื่อป้องกันสินค้าหาย)
  // ทุกครั้งที่สต็อกสินค้าเปลี่ยน (ขาย, ยกเลิกบิล, นำเข้า, ปรับสต็อก) ให้ดึงรายการเคลื่อนไหวใหม่จากเครื่อง
  // แล้วรวมกับรายการที่โหลดจากฐานข้อมูลไว้แล้ว (ไม่ซ้ำ id)
  useEffect(() => {
    const localLedger = posService.getStockLedger();
    setStockLedger((prev) => {
      const localIds = new Set(localLedger.map((e) => e.id));
      return [...localLedger, ...prev.filter((e) => !localIds.has(e.id))].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    });
    // ล็อตถูกปรับพร้อมกับการเคลื่อนไหวสต็อก (ข้อมูลในเครื่องรวมกับฐานข้อมูลแล้วตอนโหลด)
    setProductLots(posService.getProductLots());
  }, [products]);

  // movementMeta: { reason, approved_by, reference_doc } สำหรับบันทึก Stock Ledger
  const updateProductStock = useCallback(
    async (productId, newStock, newCostPrice = undefined, movementMeta = {}) => {
      const safeStock = Math.max(0, Number(newStock) || 0);
      const hasNewCost =
        newCostPrice !== undefined && newCostPrice !== null && newCostPrice !== '';
      const safeCostPrice = hasNewCost
        ? Math.max(0, Number(newCostPrice) || 0)
        : undefined;
      const nowIso = new Date().toISOString();

      let updatedTarget = null;
      setProducts((prev) => {
        const mapped = prev.map((p) => {
          if (p.id !== productId) return p;
          return {
            ...p,
            stock: safeStock,
            cost_price: hasNewCost ? safeCostPrice : p.cost_price,
            updated_at: nowIso,
          };
        });
        const synced = normalizeAndSyncProducts(mapped);
        updatedTarget = synced.find((p) => p.id === productId);
        return synced;
      });

      const syncedList = await posService.updateStock(
        productId,
        safeStock,
        dbMode === 'supabase',
        safeCostPrice,
        products,
        movementMeta
      );
      // ตั้งค่าตามผลลัพธ์จากชั้นข้อมูลอีกครั้ง เพื่อให้รายการเคลื่อนไหวสต็อกถูกดึงหลังบันทึกแล้ว
      setProducts(syncedList);
      const finalTarget =
        syncedList.find((p) => p.id === productId) || updatedTarget;
      if (finalTarget) {
        showToast(
          `อัปเดตสต็อก "${finalTarget.name}" เป็น ${finalTarget.stock} ${finalTarget.unit} เรียบร้อย`,
          'success'
        );
      }
      return finalTarget;
    },
    [dbMode, products, showToast]
  );

  // เปิด/ปิดการติดตาม Lot และกลยุทธ์ FEFO/FIFO ของสินค้า
  const updateLotSettings = useCallback(
    async (productId, settings) => {
      const { updatedProducts, updatedLots } = await posService.updateLotSettings(
        productId,
        settings,
        dbMode === 'supabase',
        products
      );
      setProducts(updatedProducts);
      setProductLots(updatedLots);
    },
    [dbMode, products]
  );

  // ปรับยอดล็อตรวมให้เท่าสต็อกจริงของสินค้า
  const reconcileProductLots = useCallback(
    async (productId) => {
      const lots = await posService.reconcileProductLots(productId, dbMode === 'supabase', products);
      setProductLots(lots);
      showToast('ปรับยอดล็อตให้ตรงกับสต็อกแล้ว', 'success');
    },
    [dbMode, products, showToast]
  );

  const updateLotDetails = useCallback(
    async (lotId, details) => {
      const lots = await posService.updateLotDetails(lotId, details, dbMode === 'supabase');
      setProductLots(lots);
      showToast('บันทึกข้อมูลล็อตแล้ว', 'success');
    },
    [dbMode, showToast]
  );

  // ตั้งค่าจุดสั่งซื้อ (ระยะเวลารอสินค้า / สต็อกสำรอง) ของสินค้า
  const updateReorderSettings = useCallback(
    async (productId, settings) => {
      const updated = await posService.updateReorderSettings(
        productId,
        settings,
        dbMode === 'supabase',
        products
      );
      setProducts(updated);
    },
    [dbMode, products]
  );

  // บันทึก/ลบ ราคาขายส่งหลายระดับ (สูงสุด 10 ขั้น) พร้อมซิงก์กับข้อมูลราคาขายส่งของตัวสินค้า
  const saveWholesaleRule = useCallback(
    async (ruleData) => {
      const { savedRule, updatedRules, updatedProducts } =
        await posService.upsertWholesaleRule(
          ruleData,
          dbMode === 'supabase',
          products
        );
      setWholesaleRules(updatedRules);
      if (updatedProducts) {
        setProducts(updatedProducts);
      }
      showToast(`บันทึกราคาขายส่ง "${savedRule.name}" เรียบร้อย`, 'success');
      return savedRule;
    },
    [dbMode, products, showToast]
  );

  const deleteWholesaleRule = useCallback(
    async (ruleId) => {
      const { updatedRules, updatedProducts } =
        await posService.deleteWholesaleRule(ruleId, products);
      setWholesaleRules(updatedRules);
      if (updatedProducts) {
        setProducts(updatedProducts);
      }
      showToast('ลบรายการราคาขายส่งเรียบร้อยแล้ว', 'info');
    },
    [products, showToast]
  );

  // บันทึก/ลบ ราคาพิเศษ (สูงสุด 10 ขั้น)
  const saveSpecialRule = useCallback(
    async (ruleData) => {
      const { savedRule, updatedRules } =
        await posService.upsertSpecialRule(ruleData);
      setSpecialRules(updatedRules);
      showToast(`บันทึกราคาพิเศษ "${savedRule.name}" เรียบร้อย`, 'success');
      return savedRule;
    },
    [showToast]
  );

  const deleteSpecialRule = useCallback(
    async (ruleId) => {
      const updatedRules = await posService.deleteSpecialRule(ruleId);
      setSpecialRules(updatedRules);
      showToast('ลบรายการราคาพิเศษเรียบร้อยแล้ว', 'info');
    },
    [showToast]
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
      setSelectedCustomer((prev) =>
        prev && prev.id === saved.id ? saved : prev
      );
      showToast(`บันทึกข้อมูลลูกค้า "${saved.name}" สำเร็จ`, 'success');
      return saved;
    },
    [dbMode, showToast]
  );

  // ออกใบกำกับภาษีเต็มรูปแบบจากบิลขาย
  const createTaxInvoice = useCallback(
    async (invoiceData) => {
      try {
        const { savedInvoice, updatedInvoices } = await posService.createTaxInvoice(
          invoiceData,
          dbMode === 'supabase',
          taxInvoices
        );
        setTaxInvoices(updatedInvoices);
        showToast(`ออกใบกำกับภาษี ${savedInvoice.invoice_number} เรียบร้อย`, 'success');
        return savedInvoice;
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [dbMode, taxInvoices, showToast]
  );

  // ตรวจนับสต็อกแบบ Blind Count: สร้างใบนับ > บันทึกผลนับ > ส่งผล (บันทึกยอดในระบบ ณ ตอนส่ง) > อนุมัติปรับสต็อก
  // ---------- คลังสินค้าหลายคลัง และใบโอนสต็อก (Module 3) ----------
  const saveWarehouse = useCallback(
    async (warehouse) => {
      if (!String(warehouse.name || '').trim()) {
        showToast('กรุณาระบุชื่อคลัง', 'error');
        return false;
      }
      const updated = await posService.saveWarehouse(warehouse, dbMode === 'supabase');
      setWarehouses(updated);
      showToast(`บันทึกคลัง ${warehouse.name} แล้ว`, 'success');
      return true;
    },
    [dbMode, showToast]
  );

  const applyTransferResult = useCallback((result) => {
    setStockTransfers(result.transfers);
    setInventoryBalances(result.balances);
    return result.saved;
  }, []);

  const createStockTransfer = useCallback(
    async ({ fromId, toId, items, note = '' }) => {
      const error = validateTransfer({ fromId, toId, items }, products, inventoryBalances, warehouses);
      if (error) {
        showToast(error, 'error');
        return null;
      }
      const nowIso = new Date().toISOString();
      const record = {
        id: `trf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        // ใช้วันที่ตามเวลาเครื่อง (ไม่ใช่ UTC) เพื่อไม่ให้เลขที่ช่วงเช้ามืดเป็นวันก่อนหน้า
        transfer_number: `TRF-${new Date().toLocaleDateString('sv-SE').slice(2).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        items: items
          .filter((i) => Number(i.qty) > 0)
          .map((i) => {
            const p = products.find((x) => x.id === i.product_id);
            return { product_id: i.product_id, product_name: p?.name || '', sku: p?.sku || '', unit: p?.unit || 'ชิ้น', qty: Number(i.qty) };
          }),
        note,
        status: 'in_transit',
        created_by_name: currentUser?.name || '',
        created_at: nowIso,
      };
      try {
        const saved = applyTransferResult(await posService.saveStockTransfer(record, dbMode === 'supabase'));
        showToast(`สร้างใบโอน ${saved.transfer_number} แล้ว (รอคลังปลายทางยืนยันรับ)`, 'success');
        return saved;
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [products, inventoryBalances, warehouses, currentUser, dbMode, applyTransferResult, showToast]
  );

  const changeStockTransferStatus = useCallback(
    async (transfer, status) => {
      const nowIso = new Date().toISOString();
      const byName = currentUser?.name || '';
      const record =
        status === 'received'
          ? { ...transfer, status, received_by_name: byName, received_at: nowIso }
          : { ...transfer, status, cancelled_by_name: byName, cancelled_at: nowIso };
      try {
        const saved = applyTransferResult(await posService.saveStockTransfer(record, dbMode === 'supabase'));
        showToast(
          status === 'received' ? `รับสินค้าตามใบโอน ${saved.transfer_number} แล้ว` : `ยกเลิกใบโอน ${saved.transfer_number} และคืนยอดคลังต้นทางแล้ว`,
          status === 'received' ? 'success' : 'warning'
        );
        return saved;
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [currentUser, dbMode, applyTransferResult, showToast]
  );

  // ---------- ใบสั่งขายส่ง / จองสินค้า (Reserved Stock & ATP) ----------
  const reservedByProduct = useMemo(() => calculateReservedByProduct(salesOrders), [salesOrders]);

  const createSalesOrder = useCallback(
    async ({ customer, items, dueDate = '', note = '' }) => {
      if (!customer) {
        showToast('กรุณาเลือกลูกค้า', 'error');
        return null;
      }
      const error = validateSalesOrderItems(items, products, reservedByProduct);
      if (error) {
        showToast(error, 'error');
        return null;
      }
      const record = {
        id: `so-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        so_number: `SO-${new Date().toLocaleDateString('sv-SE').slice(2).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
        customer_id: customer.id,
        customer_name: customer.shop_name && customer.shop_name !== '-' ? `${customer.name} (${customer.shop_name})` : customer.name,
        items: buildSalesOrderItems(items, products),
        due_date: dueDate || null,
        note,
        status: 'reserved',
        created_by_name: currentUser?.name || '',
        created_at: new Date().toISOString(),
      };
      const result = await posService.saveSalesOrder(record, dbMode === 'supabase');
      setSalesOrders(result.salesOrders);
      showToast(`สร้างใบสั่งขาย ${record.so_number} และจองสินค้าแล้ว`, 'success');
      return result.saved;
    },
    [products, reservedByProduct, currentUser, dbMode, showToast]
  );

  const cancelSalesOrder = useCallback(
    async (salesOrder) => {
      try {
        const result = await posService.saveSalesOrder(
          { ...salesOrder, status: 'cancelled', cancelled_by_name: currentUser?.name || '', cancelled_at: new Date().toISOString() },
          dbMode === 'supabase'
        );
        setSalesOrders(result.salesOrders);
        if (activeSalesOrderRef.current?.id === salesOrder.id) setActiveSalesOrder(null);
        showToast(`ยกเลิกใบสั่งขาย ${salesOrder.so_number} และคืนยอดจองแล้ว`, 'warning');
        return true;
      } catch (err) {
        showToast(err.message, 'error');
        return false;
      }
    },
    [currentUser, dbMode, showToast]
  );

  // เปิดใบสั่งขายเข้าตะกร้าหน้าขาย เพื่อคิดเงินตามขั้นตอนปกติ (ราคาคำนวณตามเรตลูกค้า)
  const loadSalesOrderToCart = useCallback(
    (salesOrder) => {
      if (cart.length > 0) {
        showToast('มีสินค้าในตะกร้าอยู่ กรุณาพักบิลหรือล้างตะกร้าก่อน', 'error');
        return false;
      }
      const missing = [];
      const lines = [];
      (salesOrder.items || []).forEach((item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) {
          missing.push(item.product_name);
          return;
        }
        const qty = Math.min(Number(item.qty) || 0, Number(product.stock) || 0);
        if (qty < item.qty) missing.push(item.product_name);
        if (qty > 0) lines.push({ product, quantity: qty, customPrice: null });
      });
      if (lines.length === 0) {
        showToast('สินค้าในใบสั่งขายไม่มีสต็อกพอสำหรับเปิดบิล', 'error');
        return false;
      }
      setCart(lines);
      const customer = customers.find((c) => c.id === salesOrder.customer_id) || null;
      handleSelectCustomer(customer);
      setActiveSalesOrder(salesOrder);
      if (missing.length > 0) showToast(`สต็อกไม่พอบางรายการ: ${missing.join(', ')}`, 'warning');
      return true;
    },
    [cart.length, products, customers, handleSelectCustomer, showToast]
  );

  const persistStockCount = useCallback(
    async (record) => {
      const { savedCount, updatedCounts } = await posService.saveStockCount(record, dbMode === 'supabase');
      setStockCounts(updatedCounts);
      return savedCount;
    },
    [dbMode]
  );

  const createStockCount = useCallback(
    async ({ scopeLabel, productIds }) => {
      const nowIso = new Date().toISOString();
      const items = products
        .filter((p) => !p.linked_product_id && productIds.includes(p.id))
        .map((p) => ({
          product_id: p.id,
          product_name: p.name,
          sku: p.sku || '',
          barcode: p.barcode || '',
          unit: p.unit || 'ชิ้น',
          cost_price: Number(p.cost_price) || 0,
          counted_qty: null,
          system_qty: null,
        }));
      if (items.length === 0) {
        showToast('ไม่มีสินค้าให้ตรวจนับ', 'error');
        return null;
      }
      const record = {
        id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        count_number: `CC-${nowIso.slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
        scope_label: scopeLabel,
        status: 'counting',
        items,
        created_by: currentUser?.name || '',
        created_at: nowIso,
      };
      const saved = await persistStockCount(record);
      showToast(`สร้างใบตรวจนับ ${saved.count_number} (${items.length} รายการ)`, 'success');
      return saved;
    },
    [products, currentUser, persistStockCount, showToast]
  );

  const saveStockCountProgress = useCallback(
    (count, items) => persistStockCount({ ...count, items }),
    [persistStockCount]
  );

  const submitStockCount = useCallback(
    async (count, items) => {
      const stockById = new Map(products.map((p) => [p.id, Number(p.stock) || 0]));
      const saved = await persistStockCount({
        ...count,
        items: items.map((it) => ({ ...it, system_qty: stockById.get(it.product_id) ?? 0 })),
        status: 'submitted',
        submitted_by: currentUser?.name || '',
        submitted_at: new Date().toISOString(),
      });
      showToast(`ส่งผลตรวจนับ ${saved.count_number} รออนุมัติ`, 'info');
      return saved;
    },
    [products, currentUser, persistStockCount, showToast]
  );

  const approveStockCount = useCallback(
    async (count) => {
      const approvedBy = currentUser?.name || 'ผู้ดูแล';
      const updatedProducts = await posService.applyStockCountAdjustments(
        count,
        approvedBy,
        dbMode === 'supabase',
        products
      );
      setProducts(updatedProducts);
      const saved = await persistStockCount({
        ...count,
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      });
      showToast(`อนุมัติผลตรวจนับ ${saved.count_number} และปรับสต็อกแล้ว`, 'success');
      return saved;
    },
    [currentUser, dbMode, products, persistStockCount, showToast]
  );

  const cancelStockCount = useCallback(
    async (count) => {
      const saved = await persistStockCount({ ...count, status: 'cancelled' });
      showToast(`ยกเลิกใบตรวจนับ ${saved.count_number}`, 'warning');
      return saved;
    },
    [persistStockCount, showToast]
  );

  // ออกใบลดหนี้ / ใบเพิ่มหนี้ อ้างอิงใบกำกับภาษีเต็มรูป
  const createTaxNote = useCallback(
    async (noteData) => {
      try {
        const { savedNote, updatedNotes, updatedProducts } = await posService.createTaxNote(
          noteData,
          dbMode === 'supabase',
          taxNotes,
          products
        );
        setTaxNotes(updatedNotes);
        if (updatedProducts) setProducts(updatedProducts);
        showToast(
          `ออก${savedNote.note_type === 'credit' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'} ${savedNote.note_number} เรียบร้อย`,
          'success'
        );
        return savedNote;
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [dbMode, taxNotes, products, showToast]
  );

  // ออกใบวางบิล (Billing Note) ให้ลูกค้าเครดิต
  const createBillingNote = useCallback(
    async (noteData) => {
      const { savedNote, updatedNotes } = await posService.createBillingNote(
        noteData,
        dbMode === 'supabase'
      );
      setBillingNotes(updatedNotes);
      showToast(`ออกใบวางบิล ${savedNote.billing_number} เรียบร้อย`, 'success');
      return savedNote;
    },
    [dbMode, showToast]
  );

  // รับชำระหนี้จากลูกค้าเครดิต
  const recordCustomerPayment = useCallback(
    async (paymentData) => {
      const { savedPayment, updatedPayments } = await posService.recordCustomerPayment(
        paymentData,
        dbMode === 'supabase'
      );
      setCustomerPayments(updatedPayments);
      showToast(
        `รับชำระหนี้ ${savedPayment.receipt_number} จำนวน ${savedPayment.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท แล้ว`,
        'success'
      );
      return savedPayment;
    },
    [dbMode, showToast]
  );

  // บันทึก/ลบ ผู้ผลิต (Supplier)
  const saveSupplier = useCallback(
    async (supplierData) => {
      const { savedSupplier, updatedSuppliers } =
        await posService.upsertSupplier(supplierData);
      setSuppliers(updatedSuppliers);
      showToast(`บันทึกข้อมูลผู้ผลิต "${savedSupplier.name}" สำเร็จ`, 'success');
      return savedSupplier;
    },
    [showToast]
  );

  const deleteSupplier = useCallback(
    async (supplierId) => {
      const updated = await posService.deleteSupplier(supplierId);
      setSuppliers(updated);
      showToast('ลบข้อมูลผู้ผลิตเรียบร้อยแล้ว', 'info');
    },
    [showToast]
  );

  // ใบนำเข้าสินค้า (Stock Import): รออนุมัติ > ระหว่างขนส่ง > นำเข้าสำเร็จ
  // สต็อกจะเพิ่มเมื่อใบนำเข้าเปลี่ยนเป็น "นำเข้าสำเร็จ" เท่านั้น
  const applyStockImportResult = useCallback(
    ({ savedImport, updatedImports, updatedProducts }) => {
      setStockImports(updatedImports);
      if (updatedProducts) {
        setProducts(updatedProducts);
        // รับเข้าคลังที่ไม่ใช่หน้าร้านจะเพิ่มยอดแยกคลังด้วย
        setInventoryBalances(posService.getInventoryBalances());
      }
      const messages = {
        pending: [`ส่งขออนุมัติใบนำเข้า ${savedImport.import_number} แล้ว (ยังไม่เพิ่มสต็อก)`, 'info'],
        in_transit: [`อนุมัติใบนำเข้า ${savedImport.import_number} แล้ว สถานะ: ระหว่างขนส่ง`, 'info'],
        completed: [`นำเข้าสินค้าใบงาน ${savedImport.import_number} เข้าคลังเรียบร้อย!`, 'success'],
        cancelled: [`ยกเลิกใบนำเข้า ${savedImport.import_number} แล้ว`, 'warning'],
      };
      const [msg, type] = messages[savedImport.status] || messages.pending;
      showToast(msg, type);
      return savedImport;
    },
    [showToast]
  );

  const createStockImport = useCallback(
    async (importPayload) => {
      const result = await posService.createStockImport(
        importPayload,
        dbMode === 'supabase',
        products
      );
      return applyStockImportResult(result);
    },
    [dbMode, products, applyStockImportResult]
  );

  const updateStockImport = useCallback(
    async (importId, importPayload) => {
      try {
        const result = await posService.updateStockImport(
          importId,
          importPayload,
          dbMode === 'supabase',
          products
        );
        return applyStockImportResult(result);
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [dbMode, products, applyStockImportResult, showToast]
  );

  const changeStockImportStatus = useCallback(
    async (importId, nextStatus) => {
      try {
        const result = await posService.changeStockImportStatus(
          importId,
          nextStatus,
          dbMode === 'supabase',
          products
        );
        return applyStockImportResult(result);
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [dbMode, products, applyStockImportResult, showToast]
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

  // ซิงค์รายการที่ค้างตอนออฟไลน์ขึ้น Supabase แล้วโหลดข้อมูลล่าสุด
  const syncNow = useCallback(
    async ({ silent = false } = {}) => {
      if (syncing) return;
      setSyncing(true);
      try {
        const result = await posService.flushOfflineQueue();
        setPendingSyncCount(result.remaining);
        if (result.synced > 0 || result.failed > 0 || dbMode !== 'supabase' || isOffline) {
          await refreshData();
        }
        if (!silent || result.synced > 0) {
          if (result.remaining > 0) {
            showToast(`ยังเชื่อมต่อไม่ได้ ค้างซิงค์ ${result.remaining} รายการ`, 'warning');
          } else if (result.failed > 0) {
            showToast(`ซิงค์ไม่สำเร็จ ${result.failed} รายการ (เก็บไว้ในเครื่อง)`, 'error');
          } else if (result.synced > 0) {
            showToast(`ซิงค์ข้อมูลขึ้นระบบแล้ว ${result.synced} รายการ`, 'success');
          } else if (!silent) {
            showToast('ข้อมูลเป็นปัจจุบันแล้ว', 'info');
          }
        }
      } finally {
        setSyncing(false);
      }
    },
    [syncing, dbMode, isOffline, refreshData, showToast]
  );

  // ติดตามสถานะเน็ต: กลับมาออนไลน์ให้ซิงค์อัตโนมัติ
  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncNowRef.current({ silent: true });
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // ตรวจคิวทุก 1 นาที เผื่อเน็ตกลับมาโดยไม่มี event
    const timer = setInterval(() => {
      const queued = posService.getOfflineQueue().length;
      setPendingSyncCount(queued);
      if (queued > 0 && navigator.onLine !== false) syncNowRef.current({ silent: true });
    }, 60000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
  }, []);

  const resetDemo = useCallback(async () => {
    posService.resetDemoData();
    await refreshData();
    clearCart();
    showToast('รีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นเรียบร้อย', 'info');
  }, [refreshData, clearCart, showToast]);

  // ล็อกอินด้วย PIN (ผิดติดกัน 5 ครั้ง ล็อก 30 วินาที)
  const [failedPinAttempts, setFailedPinAttempts] = useState({ count: 0, lockedUntil: 0 });
  const login = useCallback(
    (userId, pin) => {
      const now = Date.now();
      if (failedPinAttempts.lockedUntil > now) {
        const waitSec = Math.ceil((failedPinAttempts.lockedUntil - now) / 1000);
        return { ok: false, message: `ใส่ PIN ผิดหลายครั้ง กรุณารอ ${waitSec} วินาที` };
      }
      const user = users.find((u) => u.id === userId);
      if (!posService.verifyUserPin(user, pin)) {
        const count = failedPinAttempts.count + 1;
        setFailedPinAttempts({ count: count >= 5 ? 0 : count, lockedUntil: count >= 5 ? now + 30000 : 0 });
        return { ok: false, message: 'PIN ไม่ถูกต้อง' };
      }
      setFailedPinAttempts({ count: 0, lockedUntil: 0 });
      setSessionUserId(user.id);
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId: user.id, at: now }));
      } catch {
        // ignore storage errors
      }
      showToast(`ยินดีต้อนรับ ${user.name}`, 'success');
      return { ok: true };
    },
    [users, failedPinAttempts, showToast]
  );

  const logout = useCallback(() => {
    setSessionUserId(null);
    clearCart();
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [clearCart]);

  const saveUser = useCallback(
    async (userData) => {
      try {
        const { savedUser, updatedUsers } = await posService.upsertUser(userData, dbMode === 'supabase');
        setUsers(updatedUsers);
        // ผู้ใช้คนแรกที่สร้าง (ผู้ดูแลระบบ) ล็อกอินให้อัตโนมัติ
        if (!authEnabled) {
          setSessionUserId(savedUser.id);
          try {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId: savedUser.id, at: Date.now() }));
          } catch {
            // ignore storage errors
          }
        }
        showToast(`บันทึกผู้ใช้งาน "${savedUser.name}" เรียบร้อย`, 'success');
        return savedUser;
      } catch (err) {
        showToast(err.message, 'error');
        return null;
      }
    },
    [dbMode, authEnabled, showToast]
  );

  // ยืนยันผู้อนุมัติด้วย PIN (เช่น ผู้จัดการอนุมัติการลดสต็อก) คืนผู้ใช้ที่อนุมัติ หรือ null
  const verifyApprover = useCallback(
    (userId, pin, permission) => {
      const user = users.find((u) => u.id === userId);
      if (!posService.verifyUserPin(user, pin)) return null;
      return hasPermission(user, permission) ? user : null;
    },
    [users]
  );

  const can = useCallback((permission) => hasPermission(currentUser, permission), [currentUser]);
  const canTab = useCallback((tab) => canAccessTab(currentUser, tab), [currentUser]);

  const value = {
    appVersion: APP_VERSION,
    isOffline,
    pendingSyncCount,
    syncing,
    syncNow,
    users,
    currentUser,
    authEnabled,
    login,
    logout,
    saveUser,
    can,
    canTab,
    verifyApprover,
    dbMode,
    loading,
    categories,
    units,
    products,
    trashedProducts,
    customers,
    suppliers,
    stockImports,
    orders,
    wholesaleRules,
    specialRules,
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
    updateReorderSettings,
    saveWholesaleRule,
    deleteWholesaleRule,
    saveSpecialRule,
    deleteSpecialRule,
    addCategory,
    updateCategory,
    deleteCategory,
    addUnit,
    updateUnit,
    deleteUnit,
    saveCustomer,
    customerPayments,
    getCustomerCredit,
    recordCustomerPayment,
    stockLedger,
    taxInvoices,
    createTaxInvoice,
    taxNotes,
    createTaxNote,
    stockCounts,
    warehouses,
    inventoryBalances,
    stockTransfers,
    salesOrders,
    reservedByProduct,
    activeSalesOrder,
    createSalesOrder,
    cancelSalesOrder,
    loadSalesOrderToCart,
    saveWarehouse,
    createStockTransfer,
    changeStockTransferStatus,
    productLots,
    updateLotSettings,
    reconcileProductLots,
    updateLotDetails,
    createStockCount,
    saveStockCountProgress,
    submitStockCount,
    approveStockCount,
    cancelStockCount,
    billingNotes,
    createBillingNote,
    saveSupplier,
    deleteSupplier,
    createStockImport,
    updateStockImport,
    changeStockImportStatus,
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
