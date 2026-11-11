import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  INITIAL_CATEGORIES,
  INITIAL_UNITS,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_ORDERS,
} from '../data/mockData';

const STORAGE_KEYS = {
  PRODUCTS: 'siampos_products_v1',
  PRODUCT_META: 'siampos_product_meta_v1',
  TRASH_PRODUCTS: 'siampos_trash_products_v1',
  CATEGORIES: 'siampos_categories_v1',
  UNITS: 'siampos_units_v1',
  CUSTOMERS: 'siampos_customers_v1',
  CUSTOMER_META: 'siampos_customer_meta_v1',
  SUPPLIERS: 'siampos_suppliers_v1',
  STOCK_IMPORTS: 'siampos_stock_imports_v1',
  ORDERS: 'siampos_orders_v1',
  WHOLESALE_RULES: 'siampos_wholesale_rules_v1',
  SPECIAL_RULES: 'siampos_special_rules_v1',
};

function getLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setLocal(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

/**
 * เติมค่าเริ่มต้นให้กับข้อมูลสินค้า (เช่น updated_at, selling_units, และระบบสินค้าสัมพันธ์ linked_product_id)
 * พร้อมตรวจสอบว่าสินค้าตัวหลักยังอยู่หรือไม่ และคำนวณสต็อกที่เชื่อมโยงกัน
 */
export function normalizeAndSyncProducts(list = []) {
  const defaultTime = '2026-10-28T09:00:00.000Z';
  const activeMap = new Map(list.map((p) => [p.id, p]));

  // ค้นหาว่าสินค้าตัวไหนเป็น "สินค้าตัวหลัก" ที่มีสินค้ารองมาเชื่อมอยู่แล้ว
  const masterIdsWithChildren = new Set();
  list.forEach((p) => {
    if (p.linked_product_id && p.linked_product_id !== p.id && activeMap.has(p.linked_product_id)) {
      masterIdsWithChildren.add(p.linked_product_id);
    }
  });

  return list.map((p, idx) => {
    let linkedId = p.linked_product_id || null;
    let linkedQty = Math.max(1, Number(p.linked_deduct_qty) || 1);

    // กฎสำคัญ:
    // 1. ถ้าสินค้าตัวหลักถูกลบไปแล้ว หรืออ้างอิงตัวเอง ให้ยกเลิกการเชื่อม
    // 2. ถ้าสินค้าตัวนี้เป็น "สินค้าตัวหลัก" ที่ถูกตัวอื่นเชื่อมอยู่แล้ว จะไม่สามารถไปเชื่อมกับตัวอื่นได้
    if (
      linkedId &&
      (linkedId === p.id ||
        !activeMap.has(linkedId) ||
        masterIdsWithChildren.has(p.id))
    ) {
      linkedId = null;
      linkedQty = 1;
    }

    const masterProd = linkedId ? activeMap.get(linkedId) : null;

    // ถ้ามีการเชื่อมสินค้าสัมพันธ์ ราคาต้นทุนและสต็อกของสินค้ารองต้องสัมพันธ์กับสินค้าหลักเสมอ
    const masterStock = masterProd ? Number(masterProd.stock) || 0 : 0;
    const syncedStock = masterProd
      ? Math.floor(masterStock / linkedQty)
      : Number(p.stock) || 0;
    const remainderStock = masterProd
      ? masterStock % linkedQty
      : Number(p.stock) || 0;

    const syncedCostPrice = masterProd
      ? Number(((Number(masterProd.cost_price) || 0) * linkedQty).toFixed(2))
      : Number(p.cost_price) || 0;

    const retailPrice = Number(p.retail_price) || 0;
    const rawWholesalePrice = Number(p.wholesale_price) || 0;
    const isWholesaleEnabled =
      p.is_wholesale_enabled !== undefined
        ? Boolean(p.is_wholesale_enabled)
        : rawWholesalePrice > 0 && rawWholesalePrice < retailPrice;

    return {
      ...p,
      cost_price: syncedCostPrice,
      retail_price: retailPrice,
      wholesale_price: isWholesaleEnabled ? rawWholesalePrice : retailPrice,
      is_wholesale_enabled: isWholesaleEnabled,
      stock: syncedStock,
      remainder_stock: remainderStock,
      master_unit: masterProd ? masterProd.unit || 'ชิ้น' : p.unit || 'ชิ้น',
      selling_units: Array.isArray(p.selling_units) ? p.selling_units : [],
      linked_product_id: linkedId,
      linked_deduct_qty: linkedId ? linkedQty : 1,
      updated_at:
        p.updated_at ||
        p.created_at ||
        new Date(Date.now() - (idx + 1) * 3600 * 1000).toISOString() ||
        defaultTime,
    };
  });
}

/**
 * ซิงก์ข้อมูลราคาขายส่งของตัวสินค้า (แบบเดี่ยว) กับระบบขายส่งหลายระดับ (wholesaleRules)
 */
export function syncInitialWholesaleRulesWithProducts(products = [], existingRules = []) {
  const nowIso = new Date().toISOString();
  const normalizedRules = (Array.isArray(existingRules) ? existingRules : []).map((r) => {
    const isGroup = r.target_type === 'group' || r.type === 'group';
    const pids = Array.isArray(r.product_ids)
      ? r.product_ids
      : r.product_id
      ? [r.product_id]
      : [];
    const pid = !isGroup ? r.product_id || pids[0] || null : null;
    const tiers = (Array.isArray(r.tiers) ? r.tiers : []).map((t, idx) => ({
      step: Number(t.step || t.level || idx + 1),
      level: Number(t.step || t.level || idx + 1),
      min_qty: Math.max(1, Number(t.min_qty) || 1),
      price: Number(t.price) || 0,
    }));
    return {
      ...r,
      type: isGroup ? 'group' : 'single',
      target_type: isGroup ? 'group' : 'single',
      product_id: pid,
      product_ids: pids,
      tiers,
    };
  });

  const singleRuleProductIds = new Set(
    normalizedRules
      .filter((r) => r.target_type === 'single' && r.product_id)
      .map((r) => r.product_id)
  );

  const autoCreatedRules = [];
  products.forEach((p) => {
    if (
      p.is_wholesale_enabled &&
      Number(p.wholesale_price) > 0 &&
      !singleRuleProductIds.has(p.id)
    ) {
      autoCreatedRules.push({
        id: `ws-rule-sync-${p.id}`,
        name: p.name,
        type: 'single',
        target_type: 'single',
        product_id: p.id,
        product_ids: [p.id],
        tiers: [
          {
            step: 1,
            level: 1,
            min_qty: Math.max(1, Number(p.wholesale_min_qty) || 6),
            price: Number(p.wholesale_price),
          },
        ],
        is_active: true,
        created_at: p.created_at || nowIso,
        updated_at: p.updated_at || nowIso,
      });
    }
  });

  if (autoCreatedRules.length > 0) {
    const combined = [...normalizedRules, ...autoCreatedRules];
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, combined);
    return combined;
  }

  setLocal(STORAGE_KEYS.WHOLESALE_RULES, normalizedRules);
  return normalizedRules;
}

export function normalizeSpecialRules(existingRules = []) {
  return (Array.isArray(existingRules) ? existingRules : []).map((r) => {
    const isGroup = r.target_type === 'group' || r.type === 'group';
    const pids = Array.isArray(r.product_ids)
      ? r.product_ids
      : r.product_id
      ? [r.product_id]
      : [];
    const pid = !isGroup ? r.product_id || pids[0] || null : null;
    const tiers = (Array.isArray(r.tiers) ? r.tiers : [])
      .map((t, idx) => ({
        step: Number(t.step || t.level || idx + 1),
        level: Number(t.step || t.level || idx + 1),
        price: Number(t.price) || 0,
      }))
      .filter((t) => t.price > 0)
      .sort((a, b) => a.step - b.step);
    return {
      ...r,
      type: isGroup ? 'group' : 'single',
      target_type: isGroup ? 'group' : 'single',
      product_id: pid,
      product_ids: pids,
      tiers,
    };
  });
}

/**
 * สถานะใบนำเข้าสินค้า (Stock Import)
 * ขั้นตอน: รออนุมัติ > ระหว่างขนส่ง > นำเข้าสำเร็จ (ยกเลิกได้ก่อนนำเข้าสำเร็จ)
 */
export const STOCK_IMPORT_STATUS = {
  PENDING: 'pending',
  IN_TRANSIT: 'in_transit',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// สถานะถัดไปที่อนุญาตให้เปลี่ยนได้จากแต่ละสถานะ
export const STOCK_IMPORT_TRANSITIONS = {
  pending: ['in_transit', 'completed', 'cancelled'],
  in_transit: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * เติมค่าเริ่มต้นให้ใบนำเข้า (ใบเก่าก่อน beta 0.2.1 ไม่มีสถานะ ถือว่านำเข้าสำเร็จแล้ว)
 */
export function normalizeStockImports(list = []) {
  return list.map((imp) => {
    const status = imp.status || STOCK_IMPORT_STATUS.COMPLETED;
    return {
      ...imp,
      status,
      status_history: Array.isArray(imp.status_history)
        ? imp.status_history
        : [{ status, at: imp.created_at }],
    };
  });
}

function generateImportNumber(nowIso) {
  const datePart = nowIso.slice(2, 10).replace(/-/g, '');
  const randPart = Math.floor(100 + Math.random() * 900);
  return `IMP-${datePart}-${randPart}`;
}

function calculateImportTotals(items = []) {
  return {
    total_items: items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
    total_discount: items.reduce((sum, it) => sum + (Number(it.total_discount) || 0), 0),
    grand_total: items.reduce((sum, it) => sum + (Number(it.line_total) || 0), 0),
  };
}

/**
 * เพิ่มสต็อกและอัปเดตราคาต้นทุนจากรายการในใบนำเข้า
 * พร้อมแปลงจำนวนของสินค้ารองกลับไปบวกเข้าสินค้าหลัก แล้วซิงค์สต็อกสินค้าสัมพันธ์
 */
async function applyImportItemsToStock(
  items = [],
  currentProducts = null,
  isSupabaseActive = false,
  nowIso = new Date().toISOString()
) {
  const baseProducts =
    Array.isArray(currentProducts) && currentProducts.length > 0
      ? currentProducts
      : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  const prodMap = new Map(baseProducts.map((p) => [p.id, p]));

  const addStockByProductId = new Map();
  const newCostByProductId = new Map();

  for (const item of items) {
    const targetProd = prodMap.get(item.product_id);
    if (!targetProd) continue;
    const qty = Math.max(1, Number(item.quantity) || 1);
    const importPrice = Math.max(0, Number(item.import_price) || 0);

    if (targetProd.linked_product_id) {
      // กรณีนำเข้าสินค้ารองที่เชื่อมกับสินค้าหลัก ให้แปลงจำนวนกลับไปบวกเข้าสินค้าหลัก
      const masterId = targetProd.linked_product_id;
      const mult = Math.max(1, Number(targetProd.linked_deduct_qty) || 1);
      addStockByProductId.set(
        masterId,
        (addStockByProductId.get(masterId) || 0) + qty * mult
      );
      if (importPrice > 0) {
        newCostByProductId.set(masterId, Number((importPrice / mult).toFixed(2)));
      }
    } else {
      addStockByProductId.set(
        targetProd.id,
        (addStockByProductId.get(targetProd.id) || 0) + qty
      );
      if (importPrice > 0) {
        newCostByProductId.set(targetProd.id, importPrice);
      }
    }
  }

  if (isSupabaseActive && supabase) {
    for (const [pid, addQty] of addStockByProductId.entries()) {
      const prod = prodMap.get(pid);
      if (prod && !String(pid).startsWith('prod-')) {
        try {
          const nextStock = (Number(prod.stock) || 0) + addQty;
          const updateObj = { stock: nextStock, updated_at: nowIso };
          if (newCostByProductId.has(pid)) {
            updateObj.cost_price = newCostByProductId.get(pid);
          }
          await supabase.from('products').update(updateObj).eq('id', pid);
        } catch {
          // fallback local
        }
      }
    }
  }

  const updatedProducts = baseProducts.map((prod) => {
    const addQty = addStockByProductId.get(prod.id) || 0;
    const hasNewCost = newCostByProductId.has(prod.id);
    if (!addQty && !hasNewCost) return prod;
    return {
      ...prod,
      stock: (Number(prod.stock) || 0) + addQty,
      cost_price: hasNewCost ? newCostByProductId.get(prod.id) : prod.cost_price,
      updated_at: nowIso,
    };
  });

  const syncedProducts = normalizeAndSyncProducts(updatedProducts);
  setLocal(STORAGE_KEYS.PRODUCTS, syncedProducts);
  return syncedProducts;
}

export const posService = {
  /**
   * โหลดข้อมูลทั้งหมดของระบบตอนเปิดแอป
   */
  async fetchAllData() {
    const localUnits = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const localTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    const localCustomerMeta = getLocal(STORAGE_KEYS.CUSTOMER_META, {});
    const rawWholesaleRules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const rawSpecialRules = getLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    const specialRules = normalizeSpecialRules(rawSpecialRules);
    const suppliers = getLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    const stockImports = normalizeStockImports(
      getLocal(STORAGE_KEYS.STOCK_IMPORTS, [])
    );

    if (isSupabaseConfigured && supabase) {
      try {
        const [catRes, prodRes, cusRes, ordRes] = await Promise.all([
          supabase.from('categories').select('*').order('created_at', { ascending: true }),
          supabase.from('products').select('*').order('name', { ascending: true }),
          supabase.from('customers').select('*').order('created_at', { ascending: false }),
          supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
        ]);

        if (catRes.error) throw catRes.error;
        if (prodRes.error) throw prodRes.error;
        if (cusRes.error) throw cusRes.error;
        if (ordRes.error) throw ordRes.error;

        const categories = [
          { id: 'all', name: 'สินค้าทั้งหมด', icon: 'LayoutGrid', color: 'indigo' },
          ...(catRes.data || []).filter((c) => c.id !== 'all'),
        ];

        const trashIds = new Set(localTrash.map((t) => t.id));
        const supaList = (prodRes.data || [])
          .filter((p) => !trashIds.has(p.id))
          .map((p) => {
            const meta = localMeta[p.id] || localMeta[p.sku] || {};
            return {
              ...p,
              is_wholesale_enabled:
                p.is_wholesale_enabled !== undefined
                  ? p.is_wholesale_enabled
                  : meta.is_wholesale_enabled,
              selling_units:
                Array.isArray(p.selling_units) && p.selling_units.length > 0
                  ? p.selling_units
                  : meta.selling_units || [],
              linked_product_id:
                p.linked_product_id || meta.linked_product_id || null,
              linked_deduct_qty:
                p.linked_deduct_qty || meta.linked_deduct_qty || 1,
            };
          });

        // รวมสินค้าที่อาจถูกสร้างใน Local ไว้ด้วยเพื่อไม่ให้สินค้าหาย
        const existingLocalProds = getLocal(STORAGE_KEYS.PRODUCTS, []);
        const supaIds = new Set(supaList.map((p) => p.id));
        const supaSkus = new Set(supaList.map((p) => p.sku));
        const extraLocalOnly = existingLocalProds.filter(
          (lp) =>
            String(lp.id).startsWith('prod-') &&
            !trashIds.has(lp.id) &&
            !supaIds.has(lp.id) &&
            !supaSkus.has(lp.sku)
        );

        const syncedSupaProducts = normalizeAndSyncProducts([
          ...extraLocalOnly,
          ...supaList,
        ]);
        setLocal(STORAGE_KEYS.PRODUCTS, syncedSupaProducts);

        const wholesaleRules = syncInitialWholesaleRulesWithProducts(
          syncedSupaProducts,
          rawWholesaleRules
        );

        const mergedCustomers = (cusRes.data || []).map((c) => {
          const cMeta = localCustomerMeta[c.id] || localCustomerMeta[c.code] || {};
          return {
            ...c,
            special_price_tier:
              c.special_price_tier !== undefined
                ? Number(c.special_price_tier) || 0
                : Number(cMeta.special_price_tier) || 0,
          };
        });

        return {
          mode: 'supabase',
          categories: categories.length > 1 ? categories : INITIAL_CATEGORIES,
          units: localUnits,
          products: syncedSupaProducts,
          trashedProducts: localTrash,
          customers: mergedCustomers,
          suppliers,
          stockImports,
          orders: ordRes.data || [],
          wholesaleRules,
          specialRules,
        };
      } catch (err) {
        console.warn('Supabase connection error, falling back to Demo Mode:', err.message);
      }
    }

    // Fallback: โหมดสาธิต (LocalStorage)
    const rawProducts = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const normalized = normalizeAndSyncProducts(rawProducts);
    setLocal(STORAGE_KEYS.PRODUCTS, normalized);

    const wholesaleRules = syncInitialWholesaleRulesWithProducts(
      normalized,
      rawWholesaleRules
    );

    const localCustomers = getLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS).map(
      (c) => {
        const cMeta = localCustomerMeta[c.id] || localCustomerMeta[c.code] || {};
        return {
          ...c,
          special_price_tier:
            c.special_price_tier !== undefined
              ? Number(c.special_price_tier) || 0
              : Number(cMeta.special_price_tier) || 0,
        };
      }
    );

    return {
      mode: 'demo',
      categories: getLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES),
      units: localUnits,
      products: normalized,
      trashedProducts: localTrash,
      customers: localCustomers,
      suppliers,
      stockImports,
      orders: getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS),
      wholesaleRules,
      specialRules,
    };
  },

  /**
   * เพิ่มหรือแก้ไขสินค้า (รองรับ selling_units และระบบสินค้าสัมพันธ์ linked_product_id / linked_deduct_qty)
   */
  async upsertProduct(productData, isSupabaseActive, currentProducts = null) {
    const nowIso = new Date().toISOString();
    const sanitizedSellingUnits = Array.isArray(productData.selling_units)
      ? productData.selling_units
          .filter((u) => u && (String(u.unit || '').trim() || String(u.barcode || '').trim()))
          .map((u, i) => ({
            id: u.id || `su-${Date.now()}-${i}`,
            barcode: String(u.barcode || '').trim(),
            unit: String(u.unit || productData.unit || 'ชิ้น').trim(),
            stock_deduct_qty: Math.max(1, Number(u.stock_deduct_qty) || 1),
          }))
      : [];

    const linkedProductId = productData.linked_product_id || null;
    const linkedDeductQty = linkedProductId
      ? Math.max(1, Number(productData.linked_deduct_qty) || 1)
      : 1;

    const isWholesaleEnabled = Boolean(productData.is_wholesale_enabled);
    const retailPriceNum = Number(productData.retail_price) || 0;
    const wholesalePriceNum = isWholesaleEnabled
      ? Number(productData.wholesale_price) || retailPriceNum
      : retailPriceNum;

    const cleanPayload = {
      sku: productData.sku.trim(),
      barcode: (productData.barcode || '').trim(),
      name: productData.name.trim(),
      category_id: productData.category_id || 'beverages',
      unit: (productData.unit || 'ชิ้น').trim(),
      cost_price: Number(productData.cost_price) || 0,
      retail_price: retailPriceNum,
      wholesale_price: wholesalePriceNum,
      wholesale_min_qty: Math.max(1, Number(productData.wholesale_min_qty) || 6),
      is_wholesale_enabled: isWholesaleEnabled,
      stock: Number(productData.stock) || 0,
      min_stock: Number(productData.min_stock) || 10,
      pack_size: (productData.pack_size || '').trim(),
      image_url: (productData.image_url || '').trim(),
      selling_units: sanitizedSellingUnits,
      linked_product_id: linkedProductId,
      linked_deduct_qty: linkedDeductQty,
      updated_at: nowIso,
      is_active: productData.is_active !== false,
    };

    const baseSupabasePayload = {
      sku: cleanPayload.sku,
      barcode: cleanPayload.barcode,
      name: cleanPayload.name,
      category_id: cleanPayload.category_id,
      unit: cleanPayload.unit,
      cost_price: cleanPayload.cost_price,
      retail_price: cleanPayload.retail_price,
      wholesale_price: cleanPayload.wholesale_price,
      wholesale_min_qty: cleanPayload.wholesale_min_qty,
      stock: cleanPayload.stock,
      min_stock: cleanPayload.min_stock,
      pack_size: cleanPayload.pack_size,
      image_url: cleanPayload.image_url,
      updated_at: cleanPayload.updated_at,
      is_active: cleanPayload.is_active,
    };

    let savedSupaRow = null;

    if (isSupabaseActive && supabase) {
      try {
        if (productData.id && !String(productData.id).startsWith('prod-')) {
          let { data, error } = await supabase
            .from('products')
            .update(cleanPayload)
            .eq('id', productData.id)
            .select()
            .single();
          if (error) {
            const retry = await supabase
              .from('products')
              .update(baseSupabasePayload)
              .eq('id', productData.id)
              .select()
              .single();
            if (!retry.error) data = retry.data;
          }
          if (data) savedSupaRow = data;
        } else {
          let { data, error } = await supabase
            .from('products')
            .insert([cleanPayload])
            .select()
            .single();
          if (error) {
            const retry = await supabase
              .from('products')
              .insert([baseSupabasePayload])
              .select()
              .single();
            if (!retry.error) data = retry.data;
          }
          if (data) savedSupaRow = data;
        }
      } catch (err) {
        console.warn('Supabase upsert fallback to local:', err.message);
      }
    }

    const baseProducts =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    let updatedList = [...baseProducts];

    // กรณีบันทึกสินค้ารองที่มีการเชื่อมสินค้าสัมพันธ์ และมีการปรับแก้จำนวนสต็อกของสินค้ารอง ให้ซิงค์กลับไปที่สินค้าตัวหลักด้วย
    if (linkedProductId && productData.sync_master_stock) {
      const masterTarget = updatedList.find((p) => p.id === linkedProductId);
      if (masterTarget) {
        const currentMasterStock = Number(masterTarget.stock) || 0;
        const remainder = currentMasterStock % linkedDeductQty;
        const nextMasterStock = Math.max(
          0,
          (Number(productData.stock) || 0) * linkedDeductQty + remainder
        );
        if (isSupabaseActive && supabase && !String(linkedProductId).startsWith('prod-')) {
          try {
            await supabase
              .from('products')
              .update({ stock: nextMasterStock, updated_at: nowIso })
              .eq('id', linkedProductId);
          } catch {
            // fallback local
          }
        }
        updatedList = updatedList.map((p) =>
          p.id === linkedProductId
            ? { ...p, stock: nextMasterStock, updated_at: nowIso }
            : p
        );
      }
    }

    const targetId = savedSupaRow?.id || productData.id || `prod-${Date.now()}`;

    // บันทึกข้อมูลเสริมลง PRODUCT_META เพื่อให้ไม่สูญหายแม้ตาราง Supabase ยังไม่ได้เพิ่มคอลัมน์ใหม่
    const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    const metaEntry = {
      is_wholesale_enabled: isWholesaleEnabled,
      selling_units: sanitizedSellingUnits,
      linked_product_id: linkedProductId,
      linked_deduct_qty: linkedDeductQty,
    };
    localMeta[targetId] = metaEntry;
    localMeta[cleanPayload.sku] = metaEntry;
    setLocal(STORAGE_KEYS.PRODUCT_META, localMeta);

    const mergedProduct = {
      ...(savedSupaRow || {}),
      ...cleanPayload,
      id: targetId,
      created_at: savedSupaRow?.created_at || productData.created_at || nowIso,
    };

    if (productData.id && updatedList.some((p) => p.id === productData.id)) {
      updatedList = updatedList.map((p) =>
        p.id === productData.id ? mergedProduct : p
      );
    } else if (updatedList.some((p) => p.id === targetId)) {
      updatedList = updatedList.map((p) =>
        p.id === targetId ? mergedProduct : p
      );
    } else {
      updatedList = [mergedProduct, ...updatedList];
    }

    const syncedList = normalizeAndSyncProducts(updatedList);
    setLocal(STORAGE_KEYS.PRODUCTS, syncedList);

    // ซิงก์ราคาขายส่งใน Modal แก้ไขข้อมูลสินค้า กับระบบขายส่งหลายระดับ (wholesaleRules)
    const currentWsRules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const existingSingleRuleIndex = currentWsRules.findIndex(
      (r) =>
        (r.target_type || r.type) !== 'group' &&
        (r.product_id === targetId ||
          (Array.isArray(r.product_ids) &&
            r.product_ids.length === 1 &&
            r.product_ids[0] === targetId))
    );

    if (isWholesaleEnabled && wholesalePriceNum > 0) {
      const tier1 = {
        step: 1,
        level: 1,
        min_qty: cleanPayload.wholesale_min_qty,
        price: wholesalePriceNum,
      };
      if (existingSingleRuleIndex > -1) {
        const existingRule = currentWsRules[existingSingleRuleIndex];
        const restTiers = (existingRule.tiers || [])
          .slice(1)
          .map((t, i) => ({
            step: i + 2,
            level: i + 2,
            min_qty: Math.max(1, Number(t.min_qty) || 1),
            price: Number(t.price) || 0,
          }));
        const updatedRule = {
          ...existingRule,
          name: cleanPayload.name,
          type: 'single',
          target_type: 'single',
          product_id: targetId,
          product_ids: [targetId],
          tiers: [tier1, ...restTiers],
          is_active: true,
          updated_at: nowIso,
        };
        const nextWsRules = currentWsRules.map((r, idx) =>
          idx === existingSingleRuleIndex ? updatedRule : r
        );
        setLocal(STORAGE_KEYS.WHOLESALE_RULES, nextWsRules);
      } else {
        const newRule = {
          id: `ws-rule-sync-${targetId}`,
          name: cleanPayload.name,
          type: 'single',
          target_type: 'single',
          product_id: targetId,
          product_ids: [targetId],
          tiers: [tier1],
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        };
        setLocal(STORAGE_KEYS.WHOLESALE_RULES, [newRule, ...currentWsRules]);
      }
    } else if (existingSingleRuleIndex > -1) {
      const nextWsRules = currentWsRules.map((r, idx) =>
        idx === existingSingleRuleIndex
          ? { ...r, is_active: false, updated_at: nowIso }
          : r
      );
      setLocal(STORAGE_KEYS.WHOLESALE_RULES, nextWsRules);
    }

    return syncedList.find((p) => p.id === targetId) || mergedProduct;
  },

  getWholesaleRulesLocal() {
    return getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
  },

  /**
   * ย้ายสินค้าไปไว้ในถังขยะ (Soft Delete)
   * พร้อมยกเลิกการเชื่อมสินค้าสัมพันธ์ในสินค้ารองทั้งหมดที่อ้างอิงถึงสินค้าตัวหลักนี้ทันที
   */
  async moveProductToTrash(productId, isSupabaseActive, currentProducts = null) {
    const nowIso = new Date().toISOString();
    const products =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const target = products.find((p) => p.id === productId);

    let unlinkedCount = 0;
    const remainingProducts = products
      .filter((p) => p.id !== productId)
      .map((p) => {
        if (p.linked_product_id === productId) {
          unlinkedCount += 1;
          return {
            ...p,
            linked_product_id: null,
            linked_deduct_qty: 1,
            updated_at: nowIso,
          };
        }
        return p;
      });

    const syncedRemaining = normalizeAndSyncProducts(remainingProducts);
    setLocal(STORAGE_KEYS.PRODUCTS, syncedRemaining);

    let trashedItem = null;
    if (target) {
      trashedItem = {
        ...target,
        linked_product_id: null,
        linked_deduct_qty: 1,
        deleted_at: nowIso,
      };
      const currentTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
      const updatedTrash = [
        trashedItem,
        ...currentTrash.filter((t) => t.id !== productId),
      ];
      setLocal(STORAGE_KEYS.TRASH_PRODUCTS, updatedTrash);
    }

    return {
      trashedItem,
      unlinkedCount,
      updatedProducts: syncedRemaining,
    };
  },

  /**
   * กู้คืนสินค้าจากถังขยะกลับเข้าคลังสินค้าปกติ
   */
  async restoreProductFromTrash(productId) {
    const nowIso = new Date().toISOString();
    const currentTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    const target = currentTrash.find((t) => t.id === productId);
    if (!target) return null;

    const updatedTrash = currentTrash.filter((t) => t.id !== productId);
    setLocal(STORAGE_KEYS.TRASH_PRODUCTS, updatedTrash);

    const restoredProduct = {
      ...target,
      deleted_at: null,
      updated_at: nowIso,
    };

    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const updatedProducts = normalizeAndSyncProducts([
      restoredProduct,
      ...products.filter((p) => p.id !== productId),
    ]);
    setLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);

    return {
      restoredProduct: updatedProducts.find((p) => p.id === productId),
      updatedProducts,
      updatedTrash,
    };
  },

  /**
   * ลบสินค้าในถังขยะแบบถาวร (Permanent Delete)
   */
  async permanentDeleteProduct(productId, isSupabaseActive) {
    if (isSupabaseActive && supabase && !String(productId).startsWith('prod-')) {
      try {
        await supabase.from('products').delete().eq('id', productId);
      } catch {
        // ignore fallback
      }
    }
    const currentTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    const updatedTrash = currentTrash.filter((t) => t.id !== productId);
    setLocal(STORAGE_KEYS.TRASH_PRODUCTS, updatedTrash);

    // เผื่อกรณีมีค้างในรายการหลัก ให้ลบออกและตัดการเชื่อมโยงด้วย
    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const cleanedProducts = normalizeAndSyncProducts(
      products
        .filter((p) => p.id !== productId)
        .map((p) =>
          p.linked_product_id === productId
            ? { ...p, linked_product_id: null, linked_deduct_qty: 1 }
            : p
        )
    );
    setLocal(STORAGE_KEYS.PRODUCTS, cleanedProducts);

    return { updatedTrash, updatedProducts: cleanedProducts };
  },

  /**
   * ล้างถังขยะทั้งหมดแบบถาวร
   */
  async emptyTrash(isSupabaseActive) {
    const currentTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    if (isSupabaseActive && supabase) {
      for (const item of currentTrash) {
        if (item.id && !String(item.id).startsWith('prod-')) {
          try {
            await supabase.from('products').delete().eq('id', item.id);
          } catch {
            // ignore
          }
        }
      }
    }
    setLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    return [];
  },

  /**
   * ปรับปรุงจำนวนสต็อกสินค้า (และราคาต้นทุนเมื่อระบุ) พร้อมซิงค์สต็อกและต้นทุนไปยังสินค้ารองที่เชื่อมสินค้าสัมพันธ์
   */
  async updateStock(
    productId,
    newStock,
    isSupabaseActive,
    newCostPrice = undefined,
    currentProducts = null
  ) {
    const safeStock = Math.max(0, Number(newStock) || 0);
    const hasNewCost =
      newCostPrice !== undefined && newCostPrice !== null && newCostPrice !== '';
    const safeCostPrice = hasNewCost ? Math.max(0, Number(newCostPrice) || 0) : undefined;
    const nowIso = new Date().toISOString();

    if (isSupabaseActive && supabase && !String(productId).startsWith('prod-')) {
      try {
        const updatePayload = { stock: safeStock, updated_at: nowIso };
        if (hasNewCost) updatePayload.cost_price = safeCostPrice;
        await supabase
          .from('products')
          .update(updatePayload)
          .eq('id', productId);
      } catch {
        // fallback local
      }
    }
    const baseProducts =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const updated = baseProducts.map((p) => {
      if (p.id !== productId) return p;
      return {
        ...p,
        stock: safeStock,
        cost_price: hasNewCost ? safeCostPrice : p.cost_price,
        updated_at: nowIso,
      };
    });
    const synced = normalizeAndSyncProducts(updated);
    setLocal(STORAGE_KEYS.PRODUCTS, synced);
    return synced;
  },

  /**
   * เพิ่มหมวดหมู่ใหม่
   */
  async addCategory(catData, isSupabaseActive) {
    const id = catData.id || `cat-${Date.now()}`;
    const newCat = {
      id,
      name: catData.name.trim(),
      icon: catData.icon || 'Package',
      color: catData.color || 'indigo',
    };

    if (isSupabaseActive && supabase) {
      try {
        const { data, error } = await supabase
          .from('categories')
          .insert([newCat])
          .select()
          .single();
        if (!error && data) return data;
      } catch {
        // fallback local
      }
    }

    const categories = getLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
    const updated = [...categories, newCat];
    setLocal(STORAGE_KEYS.CATEGORIES, updated);
    return newCat;
  },

  /**
   * แก้ไขชื่อหมวดหมู่สินค้า
   */
  async updateCategory(categoryId, catData, isSupabaseActive) {
    const cleanName = catData.name.trim();
    if (isSupabaseActive && supabase && categoryId !== 'all') {
      try {
        await supabase
          .from('categories')
          .update({ name: cleanName })
          .eq('id', categoryId);
      } catch {
        // fallback local
      }
    }
    const categories = getLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
    const updated = categories.map((c) =>
      c.id === categoryId ? { ...c, name: cleanName } : c
    );
    setLocal(STORAGE_KEYS.CATEGORIES, updated);
    return updated.find((c) => c.id === categoryId) || { id: categoryId, name: cleanName };
  },

  /**
   * ลบหมวดหมู่สินค้า
   */
  async deleteCategory(categoryId, isSupabaseActive) {
    if (categoryId === 'all') return false;
    if (isSupabaseActive && supabase) {
      try {
        await supabase.from('categories').delete().eq('id', categoryId);
      } catch {
        // fallback local
      }
    }
    const categories = getLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
    const updated = categories.filter((c) => c.id !== categoryId);
    setLocal(STORAGE_KEYS.CATEGORIES, updated);
    return true;
  },

  /**
   * เพิ่มหน่วยนับสินค้าใหม่
   */
  async addUnit(unitData) {
    const cleanName = String(unitData.name || '').trim();
    const units = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const existing = units.find(
      (u) => u.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) return existing;

    const newUnit = {
      id: unitData.id || `unit-${Date.now()}`,
      name: cleanName,
    };
    const updated = [...units, newUnit];
    setLocal(STORAGE_KEYS.UNITS, updated);
    return newUnit;
  },

  /**
   * แก้ไขหน่วยนับสินค้า
   */
  async updateUnit(unitId, unitData) {
    const cleanName = String(unitData.name || '').trim();
    const units = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const oldUnit = units.find((u) => u.id === unitId);
    const updatedUnits = units.map((u) =>
      u.id === unitId ? { ...u, name: cleanName } : u
    );
    setLocal(STORAGE_KEYS.UNITS, updatedUnits);

    if (oldUnit && oldUnit.name !== cleanName) {
      const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
      const updatedProducts = products.map((p) => ({
        ...p,
        unit: p.unit === oldUnit.name ? cleanName : p.unit,
        selling_units: Array.isArray(p.selling_units)
          ? p.selling_units.map((su) =>
              su.unit === oldUnit.name ? { ...su, unit: cleanName } : su
            )
          : [],
      }));
      setLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);
    }

    return { id: unitId, name: cleanName, oldName: oldUnit?.name };
  },

  /**
   * ลบหน่วยนับสินค้า
   */
  async deleteUnit(unitId) {
    const units = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const updated = units.filter((u) => u.id !== unitId);
    setLocal(STORAGE_KEYS.UNITS, updated);
    return true;
  },

  /**
   * เพิ่มหรือแก้ไขข้อมูลลูกค้า (ปลีก / ยี่ปั๊วขายส่ง + สิทธิระดับราคาพิเศษ ขั้นที่ 0-10)
   */
  async upsertCustomer(customerData, isSupabaseActive) {
    const specialTier = Math.max(
      0,
      Math.min(10, Math.floor(Number(customerData.special_price_tier) || 0))
    );
    const basePayload = {
      code: (customerData.code || `CUS-${Date.now().toString().slice(-4)}`).trim(),
      name: customerData.name.trim(),
      phone: (customerData.phone || '').trim(),
      customer_type: customerData.customer_type || 'retail',
      shop_name: (customerData.shop_name || '').trim(),
      address: (customerData.address || '').trim(),
    };
    const payload = {
      ...basePayload,
      special_price_tier: specialTier,
    };

    const customerMeta = getLocal(STORAGE_KEYS.CUSTOMER_META, {});
    customerMeta[basePayload.code] = { special_price_tier: specialTier };
    if (customerData.id) {
      customerMeta[customerData.id] = { special_price_tier: specialTier };
    }
    setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);

    if (isSupabaseActive && supabase) {
      try {
        if (customerData.id && !String(customerData.id).startsWith('cus-')) {
          let { data, error } = await supabase
            .from('customers')
            .update(payload)
            .eq('id', customerData.id)
            .select()
            .single();
          if (error) {
            const retry = await supabase
              .from('customers')
              .update(basePayload)
              .eq('id', customerData.id)
              .select()
              .single();
            if (!retry.error) data = retry.data;
          }
          if (data) {
            customerMeta[data.id] = { special_price_tier: specialTier };
            setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);
            return { ...data, special_price_tier: specialTier };
          }
        } else {
          let { data, error } = await supabase
            .from('customers')
            .insert([{ ...payload, total_spent: 0, order_count: 0, points: 0 }])
            .select()
            .single();
          if (error) {
            const retry = await supabase
              .from('customers')
              .insert([{ ...basePayload, total_spent: 0, order_count: 0, points: 0 }])
              .select()
              .single();
            if (!retry.error) data = retry.data;
          }
          if (data) {
            customerMeta[data.id] = { special_price_tier: specialTier };
            setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);
            return { ...data, special_price_tier: specialTier };
          }
        }
      } catch (err) {
        console.warn('Supabase customer upsert fallback:', err.message);
      }
    }

    const customers = getLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
    if (customerData.id) {
      const updated = customers.map((c) =>
        c.id === customerData.id ? { ...c, ...payload } : c
      );
      setLocal(STORAGE_KEYS.CUSTOMERS, updated);
      return updated.find((c) => c.id === customerData.id);
    } else {
      const newCustomer = {
        ...payload,
        id: `cus-${Date.now()}`,
        total_spent: 0,
        order_count: 0,
        points: 0,
        created_at: new Date().toISOString(),
      };
      customerMeta[newCustomer.id] = { special_price_tier: specialTier };
      setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);
      const updated = [newCustomer, ...customers];
      setLocal(STORAGE_KEYS.CUSTOMERS, updated);
      return newCustomer;
    }
  },

  /**
   * บันทึกบิลขาย พร้อมตัดสต็อก (รองรับการตัดสต็อกสินค้าตัวหลักผ่านระบบสินค้าสัมพันธ์)
   */
  async createOrder(orderPayload, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const datePart = nowIso.slice(2, 10).replace(/-/g, '');
    const randomPart = Math.floor(100 + Math.random() * 900);
    const orderNumber = `INV-${datePart}-${randomPart}`;

    const fullOrder = {
      order_number: orderNumber,
      customer_id: orderPayload.customer?.id || null,
      customer_name: orderPayload.customer?.name || 'ลูกค้าทั่วไป',
      pricing_mode: orderPayload.pricing_mode || 'auto',
      subtotal: Number(orderPayload.subtotal) || 0,
      wholesale_savings: Number(orderPayload.wholesale_savings) || 0,
      bill_discount: Number(orderPayload.bill_discount) || 0,
      tax_amount: Number(orderPayload.tax_amount) || 0,
      grand_total: Number(orderPayload.grand_total) || 0,
      total_cost: Number(orderPayload.total_cost) || 0,
      payment_method: orderPayload.payment_method || 'cash',
      payments: Array.isArray(orderPayload.payments) ? orderPayload.payments : [],
      cash_received: Number(orderPayload.cash_received) || 0,
      change_amount: Number(orderPayload.change_amount) || 0,
      status: 'completed',
      note: orderPayload.note || '',
      items: orderPayload.items || [],
      created_at: nowIso,
    };

    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const prodMap = new Map(products.map((p) => [p.id, p]));

    // คำนวณยอดตัดสต็อกรวมต่อรหัสสินค้าหลัก (กรณีสินค้า B เชื่อมกับสินค้า A จะไปตัดสต็อกที่สินค้า A ตามจำนวนที่ระบุ)
    const deductionByProductId = new Map();
    for (const item of fullOrder.items) {
      const soldProd = prodMap.get(item.product_id);
      if (!soldProd) continue;
      const targetMasterId = soldProd.linked_product_id || soldProd.id;
      const deductMultiplier = soldProd.linked_product_id
        ? Math.max(1, Number(soldProd.linked_deduct_qty) || 1)
        : 1;
      const totalDeduct = (Number(item.quantity) || 0) * deductMultiplier;
      deductionByProductId.set(
        targetMasterId,
        (deductionByProductId.get(targetMasterId) || 0) + totalDeduct
      );
    }

    if (isSupabaseActive && supabase) {
      try {
        const supabaseOrderData = {
          ...fullOrder,
          customer_id:
            fullOrder.customer_id && !String(fullOrder.customer_id).startsWith('cus-')
              ? fullOrder.customer_id
              : null,
        };

        let { data: savedOrder, error: orderError } = await supabase
          .from('orders')
          .insert([supabaseOrderData])
          .select()
          .single();

        // ฐานข้อมูลที่ยังไม่ได้รัน Migration (ไม่มีคอลัมน์ payments / ไม่รองรับ 'split')
        // ให้บันทึกแบบเดิมโดยใช้ช่องทางที่ยอดชำระมากที่สุดเป็นวิธีชำระหลัก
        if (orderError) {
          const mainPayment = [...fullOrder.payments].sort((a, b) => b.amount - a.amount)[0];
          const legacyOrderData = { ...supabaseOrderData };
          delete legacyOrderData.payments;
          legacyOrderData.payment_method =
            fullOrder.payment_method === 'split'
              ? mainPayment?.method || 'cash'
              : fullOrder.payment_method;
          ({ data: savedOrder, error: orderError } = await supabase
            .from('orders')
            .insert([legacyOrderData])
            .select()
            .single());
        }

        if (!orderError && savedOrder) {
          for (const [targetId, deductQty] of deductionByProductId.entries()) {
            const targetProd = prodMap.get(targetId);
            if (targetProd && !String(targetId).startsWith('prod-')) {
              const newStock = Math.max(0, (Number(targetProd.stock) || 0) - deductQty);
              await supabase
                .from('products')
                .update({ stock: newStock, updated_at: nowIso })
                .eq('id', targetId);
            }
          }
        }
      } catch (err) {
        console.warn('Supabase order error:', err.message);
      }
    }

    // บันทึกใน LocalStorage
    const localOrder = { ...fullOrder, id: `ord-${Date.now()}` };
    const orders = getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    setLocal(STORAGE_KEYS.ORDERS, [localOrder, ...orders]);

    // ตัดสต็อกจากสินค้าหลักและซิงค์สต็อกสินค้ารองทั้งหมด
    const updatedProducts = products.map((prod) => {
      const deduct = deductionByProductId.get(prod.id);
      if (!deduct) return prod;
      return {
        ...prod,
        stock: Math.max(0, (Number(prod.stock) || 0) - deduct),
        updated_at: nowIso,
      };
    });
    const syncedProducts = normalizeAndSyncProducts(updatedProducts);
    setLocal(STORAGE_KEYS.PRODUCTS, syncedProducts);

    if (orderPayload.customer?.id) {
      const customers = getLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
      const updatedCustomers = customers.map((c) => {
        if (c.id !== orderPayload.customer.id) return c;
        const newSpent = (Number(c.total_spent) || 0) + fullOrder.grand_total;
        return {
          ...c,
          total_spent: newSpent,
          order_count: (Number(c.order_count) || 0) + 1,
          points: Math.floor(newSpent / 100),
        };
      });
      setLocal(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
    }

    return { savedOrder: localOrder, updatedProducts: syncedProducts };
  },

  /**
   * ยกเลิกบิล (Void Order) และคืนสต็อกสินค้ากลับเข้าคลัง (รองรับคืนสต็อกเข้าสินค้าหลักสำหรับสินค้าสัมพันธ์)
   */
  async voidOrder(order, currentProducts, isSupabaseActive) {
    if (order.status === 'voided') {
      return { updatedOrder: order, updatedProducts: currentProducts };
    }

    const nowIso = new Date().toISOString();
    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const prodMap = new Map(products.map((p) => [p.id, p]));

    const restoreByProductId = new Map();
    for (const item of order.items || []) {
      const soldProd = prodMap.get(item.product_id);
      const targetMasterId =
        item.linked_product_id || soldProd?.linked_product_id || item.product_id;
      const multiplier =
        item.linked_deduct_qty ||
        (soldProd?.linked_product_id
          ? Math.max(1, Number(soldProd.linked_deduct_qty) || 1)
          : 1);
      const totalRestore = (Number(item.quantity) || 0) * multiplier;
      restoreByProductId.set(
        targetMasterId,
        (restoreByProductId.get(targetMasterId) || 0) + totalRestore
      );
    }

    const orders = getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    const updatedOrders = orders.map((o) =>
      o.id === order.id ? { ...o, status: 'voided' } : o
    );
    setLocal(STORAGE_KEYS.ORDERS, updatedOrders);

    const updatedProducts = products.map((prod) => {
      const restoreQty = restoreByProductId.get(prod.id);
      if (!restoreQty) return prod;
      return {
        ...prod,
        stock: (Number(prod.stock) || 0) + restoreQty,
        updated_at: nowIso,
      };
    });
    const syncedProducts = normalizeAndSyncProducts(updatedProducts);
    setLocal(STORAGE_KEYS.PRODUCTS, syncedProducts);

    return {
      updatedOrder: { ...order, status: 'voided' },
      updatedProducts: syncedProducts,
    };
  },

  /**
   * บันทึกรายการตั้งราคาขายส่งหลายระดับ (สูงสุด 10 ขั้น รองรับทั้งแบบเดี่ยวและแบบกลุ่ม)
   * พร้อมซิงก์ขั้นที่ 1 กลับไปยังข้อมูลราคาขายส่งของตัวสินค้า (กรณีแบบเดี่ยว)
   */
  async upsertWholesaleRule(
    ruleData,
    isSupabaseActive = false,
    currentProducts = null
  ) {
    const nowIso = new Date().toISOString();
    const rules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const isGroup =
      ruleData.target_type === 'group' || ruleData.type === 'group';
    const rawProductIds = Array.isArray(ruleData.product_ids)
      ? ruleData.product_ids
      : ruleData.product_id
      ? [ruleData.product_id]
      : [];
    const singleProductId = !isGroup
      ? ruleData.product_id || rawProductIds[0] || null
      : null;
    const resolvedProductIds = isGroup
      ? rawProductIds
      : singleProductId
      ? [singleProductId]
      : [];

    const sanitizedTiers = (Array.isArray(ruleData.tiers) ? ruleData.tiers : [])
      .slice(0, 10)
      .filter((t) => Number(t.price) > 0 && Number(t.min_qty) >= 1)
      .sort((a, b) => Number(a.min_qty) - Number(b.min_qty))
      .map((t, idx) => ({
        step: idx + 1,
        level: idx + 1,
        min_qty: Math.max(1, Math.floor(Number(t.min_qty) || 1)),
        price: Number(Number(t.price).toFixed(2)),
      }));

    // กรณีแบบเดี่ยวและยังไม่ได้ระบุ id แต่มีกฎของสินค้านี้อยู่แล้ว ให้อัปเดตกฎเดิมเพื่อไม่ให้ซ้ำซ้อน
    const existingSingleRule = !ruleData.id && !isGroup && singleProductId
      ? rules.find(
          (r) =>
            (r.target_type || r.type) !== 'group' &&
            (r.product_id === singleProductId ||
              (Array.isArray(r.product_ids) &&
                r.product_ids.length === 1 &&
                r.product_ids[0] === singleProductId))
        )
      : null;

    const targetRuleId =
      ruleData.id || existingSingleRule?.id || `ws-rule-${Date.now()}`;

    const payload = {
      id: targetRuleId,
      name: String(ruleData.name || '').trim() || 'ราคาขายส่งหลายระดับ',
      type: isGroup ? 'group' : 'single',
      target_type: isGroup ? 'group' : 'single',
      product_id: singleProductId,
      product_ids: resolvedProductIds,
      tiers: sanitizedTiers,
      is_active: ruleData.is_active !== false,
      updated_at: nowIso,
      created_at:
        ruleData.created_at || existingSingleRule?.created_at || nowIso,
    };

    const exists = rules.some((r) => r.id === payload.id);
    const updated = exists
      ? rules.map((r) => (r.id === payload.id ? payload : r))
      : [payload, ...rules];
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, updated);

    // ซิงก์ขั้นที่ 1 กลับไปยังสินค้า (กรณีตั้งราคาขายส่งแบบเดี่ยว)
    let updatedProducts = null;
    if (!isGroup && singleProductId) {
      const baseProds =
        Array.isArray(currentProducts) && currentProducts.length > 0
          ? currentProducts
          : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
      const tier1 = sanitizedTiers[0];
      const nextWholesaleEnabled = payload.is_active && Boolean(tier1);

      const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
      const targetProd = baseProds.find((p) => p.id === singleProductId);
      if (targetProd) {
        const nextWholesalePrice = nextWholesaleEnabled
          ? tier1.price
          : Number(targetProd.retail_price) || 0;
        const nextMinQty = nextWholesaleEnabled
          ? tier1.min_qty
          : Number(targetProd.wholesale_min_qty) || 6;

        const existingMeta =
          localMeta[singleProductId] || localMeta[targetProd.sku] || {};
        const nextMeta = {
          ...existingMeta,
          is_wholesale_enabled: nextWholesaleEnabled,
        };
        localMeta[singleProductId] = nextMeta;
        if (targetProd.sku) localMeta[targetProd.sku] = nextMeta;
        setLocal(STORAGE_KEYS.PRODUCT_META, localMeta);

        if (
          isSupabaseActive &&
          supabase &&
          !String(singleProductId).startsWith('prod-')
        ) {
          try {
            await supabase
              .from('products')
              .update({
                wholesale_price: nextWholesalePrice,
                wholesale_min_qty: nextMinQty,
                updated_at: nowIso,
              })
              .eq('id', singleProductId);
          } catch {
            // fallback local
          }
        }

        updatedProducts = normalizeAndSyncProducts(
          baseProds.map((p) =>
            p.id === singleProductId
              ? {
                  ...p,
                  is_wholesale_enabled: nextWholesaleEnabled,
                  wholesale_price: nextWholesalePrice,
                  wholesale_min_qty: nextMinQty,
                  updated_at: nowIso,
                }
              : p
          )
        );
        setLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);
      }
    }

    return { savedRule: payload, updatedRules: updated, updatedProducts };
  },

  async deleteWholesaleRule(ruleId, currentProducts = null) {
    const nowIso = new Date().toISOString();
    const rules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const targetRule = rules.find((r) => r.id === ruleId);
    const updated = rules.filter((r) => r.id !== ruleId);
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, updated);

    let updatedProducts = null;
    if (
      targetRule &&
      (targetRule.target_type || targetRule.type) !== 'group'
    ) {
      const pid =
        targetRule.product_id ||
        (Array.isArray(targetRule.product_ids) ? targetRule.product_ids[0] : null);
      if (pid) {
        const baseProds =
          Array.isArray(currentProducts) && currentProducts.length > 0
            ? currentProducts
            : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
        const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
        const targetProd = baseProds.find((p) => p.id === pid);
        if (targetProd) {
          const existingMeta = localMeta[pid] || localMeta[targetProd.sku] || {};
          localMeta[pid] = { ...existingMeta, is_wholesale_enabled: false };
          if (targetProd.sku) {
            localMeta[targetProd.sku] = {
              ...existingMeta,
              is_wholesale_enabled: false,
            };
          }
          setLocal(STORAGE_KEYS.PRODUCT_META, localMeta);

          updatedProducts = normalizeAndSyncProducts(
            baseProds.map((p) =>
              p.id === pid
                ? {
                    ...p,
                    is_wholesale_enabled: false,
                    wholesale_price: Number(p.retail_price) || 0,
                    updated_at: nowIso,
                  }
                : p
            )
          );
          setLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);
        }
      }
    }

    return { updatedRules: updated, updatedProducts };
  },

  /**
   * บันทึกรายการราคาพิเศษ (สูงสุด 10 ขั้น ตามสิทธิของลูกค้า รองรับทั้งแบบเดี่ยวและแบบกลุ่ม)
   */
  async upsertSpecialRule(ruleData) {
    const nowIso = new Date().toISOString();
    const rules = getLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    const isGroup =
      ruleData.target_type === 'group' || ruleData.type === 'group';
    const rawProductIds = Array.isArray(ruleData.product_ids)
      ? ruleData.product_ids
      : ruleData.product_id
      ? [ruleData.product_id]
      : [];
    const singleProductId = !isGroup
      ? ruleData.product_id || rawProductIds[0] || null
      : null;
    const resolvedProductIds = isGroup
      ? rawProductIds
      : singleProductId
      ? [singleProductId]
      : [];

    const sanitizedTiers = (Array.isArray(ruleData.tiers) ? ruleData.tiers : [])
      .slice(0, 10)
      .filter((t) => Number(t.price) > 0)
      .map((t, idx) => ({
        step: Number(t.step || t.level || idx + 1),
        level: Number(t.step || t.level || idx + 1),
        price: Number(Number(t.price).toFixed(2)),
      }))
      .sort((a, b) => a.step - b.step)
      .map((t, idx) => ({
        step: idx + 1,
        level: idx + 1,
        price: t.price,
      }));

    const existingSingleRule =
      !ruleData.id && !isGroup && singleProductId
        ? rules.find(
            (r) =>
              (r.target_type || r.type) !== 'group' &&
              (r.product_id === singleProductId ||
                (Array.isArray(r.product_ids) &&
                  r.product_ids.length === 1 &&
                  r.product_ids[0] === singleProductId))
          )
        : null;

    const payload = {
      id: ruleData.id || existingSingleRule?.id || `sp-rule-${Date.now()}`,
      name: String(ruleData.name || '').trim() || 'ราคาพิเศษ',
      type: isGroup ? 'group' : 'single',
      target_type: isGroup ? 'group' : 'single',
      product_id: singleProductId,
      product_ids: resolvedProductIds,
      tiers: sanitizedTiers,
      is_active: ruleData.is_active !== false,
      updated_at: nowIso,
      created_at:
        ruleData.created_at || existingSingleRule?.created_at || nowIso,
    };

    const exists = rules.some((r) => r.id === payload.id);
    const updated = exists
      ? rules.map((r) => (r.id === payload.id ? payload : r))
      : [payload, ...rules];
    setLocal(STORAGE_KEYS.SPECIAL_RULES, updated);
    return { savedRule: payload, updatedRules: updated };
  },

  async deleteSpecialRule(ruleId) {
    const rules = getLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    const updated = rules.filter((r) => r.id !== ruleId);
    setLocal(STORAGE_KEYS.SPECIAL_RULES, updated);
    return updated;
  },

  /**
   * บันทึกหรือแก้ไขข้อมูลผู้ผลิต (Supplier)
   */
  async upsertSupplier(supplierData) {
    const nowIso = new Date().toISOString();
    const suppliers = getLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    const payload = {
      id: supplierData.id || `sup-${Date.now()}`,
      name: String(supplierData.name || '').trim(),
      address: String(supplierData.address || '').trim(),
      tambon: String(supplierData.tambon || '').trim(),
      amphoe: String(supplierData.amphoe || '').trim(),
      province: String(supplierData.province || '').trim(),
      zipcode: String(supplierData.zipcode || '').trim(),
      phone: String(supplierData.phone || '').trim(),
      updated_at: nowIso,
      created_at: supplierData.created_at || nowIso,
    };

    const exists = suppliers.some((s) => s.id === payload.id);
    const updated = exists
      ? suppliers.map((s) => (s.id === payload.id ? payload : s))
      : [payload, ...suppliers];
    setLocal(STORAGE_KEYS.SUPPLIERS, updated);
    return { savedSupplier: payload, updatedSuppliers: updated };
  },

  async deleteSupplier(supplierId) {
    const suppliers = getLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    const updated = suppliers.filter((s) => s.id !== supplierId);
    setLocal(STORAGE_KEYS.SUPPLIERS, updated);
    return updated;
  },

  /**
   * บันทึกใบนำเข้าสินค้า (Stock Import)
   * - status 'pending' (ขออนุมัติ): บันทึกใบนำเข้าไว้ ยังไม่เพิ่มสต็อก
   * - status 'completed' (อนุมัติทันที): เพิ่มสต็อกและอัปเดตต้นทุนทันที
   */
  async createStockImport(
    importPayload,
    isSupabaseActive = false,
    currentProducts = null
  ) {
    const nowIso = new Date().toISOString();
    const status =
      importPayload.status === STOCK_IMPORT_STATUS.COMPLETED
        ? STOCK_IMPORT_STATUS.COMPLETED
        : STOCK_IMPORT_STATUS.PENDING;
    const items = importPayload.items || [];

    let syncedProducts = null;
    if (status === STOCK_IMPORT_STATUS.COMPLETED) {
      syncedProducts = await applyImportItemsToStock(
        items,
        currentProducts,
        isSupabaseActive,
        nowIso
      );
    }

    const importRecord = {
      id: `imp-${Date.now()}`,
      import_number: generateImportNumber(nowIso),
      supplier_id: importPayload.supplier?.id || null,
      supplier_name: importPayload.supplier?.name || '-',
      supplier_phone: importPayload.supplier?.phone || '',
      items,
      ...calculateImportTotals(items),
      note: importPayload.note || '',
      status,
      status_history: [{ status, at: nowIso }],
      created_at: nowIso,
      updated_at: nowIso,
    };

    const existingImports = getLocal(STORAGE_KEYS.STOCK_IMPORTS, []);
    const updatedImports = normalizeStockImports([importRecord, ...existingImports]);
    setLocal(STORAGE_KEYS.STOCK_IMPORTS, updatedImports);

    return {
      savedImport: importRecord,
      updatedImports,
      updatedProducts: syncedProducts,
    };
  },

  /**
   * แก้ไขใบนำเข้าที่ยังรออนุมัติ (เปลี่ยนผู้ผลิต รายการสินค้า หรือหมายเหตุ)
   * ถ้าส่ง status 'completed' มาด้วย จะอนุมัติและเพิ่มสต็อกทันที
   */
  async updateStockImport(
    importId,
    importPayload,
    isSupabaseActive = false,
    currentProducts = null
  ) {
    const nowIso = new Date().toISOString();
    const existingImports = normalizeStockImports(
      getLocal(STORAGE_KEYS.STOCK_IMPORTS, [])
    );
    const target = existingImports.find((imp) => imp.id === importId);
    if (!target) throw new Error('ไม่พบใบนำเข้าที่ต้องการแก้ไข');
    if (target.status !== STOCK_IMPORT_STATUS.PENDING) {
      throw new Error('แก้ไขได้เฉพาะใบนำเข้าที่รออนุมัติเท่านั้น');
    }

    const items = importPayload.items || [];
    const isApproveNow = importPayload.status === STOCK_IMPORT_STATUS.COMPLETED;

    let syncedProducts = null;
    if (isApproveNow) {
      syncedProducts = await applyImportItemsToStock(
        items,
        currentProducts,
        isSupabaseActive,
        nowIso
      );
    }

    const savedImport = {
      ...target,
      supplier_id: importPayload.supplier?.id || null,
      supplier_name: importPayload.supplier?.name || '-',
      supplier_phone: importPayload.supplier?.phone || '',
      items,
      ...calculateImportTotals(items),
      note: importPayload.note || '',
      status: isApproveNow ? STOCK_IMPORT_STATUS.COMPLETED : target.status,
      status_history: isApproveNow
        ? [...target.status_history, { status: STOCK_IMPORT_STATUS.COMPLETED, at: nowIso }]
        : target.status_history,
      updated_at: nowIso,
    };

    const updatedImports = existingImports.map((imp) =>
      imp.id === importId ? savedImport : imp
    );
    setLocal(STORAGE_KEYS.STOCK_IMPORTS, updatedImports);

    return { savedImport, updatedImports, updatedProducts: syncedProducts };
  },

  /**
   * เปลี่ยนสถานะใบนำเข้า: รออนุมัติ > ระหว่างขนส่ง > นำเข้าสำเร็จ (หรือยกเลิก)
   * สต็อกจะถูกเพิ่มเมื่อเปลี่ยนเป็น "นำเข้าสำเร็จ" เท่านั้น
   */
  async changeStockImportStatus(
    importId,
    nextStatus,
    isSupabaseActive = false,
    currentProducts = null
  ) {
    const nowIso = new Date().toISOString();
    const existingImports = normalizeStockImports(
      getLocal(STORAGE_KEYS.STOCK_IMPORTS, [])
    );
    const target = existingImports.find((imp) => imp.id === importId);
    if (!target) throw new Error('ไม่พบใบนำเข้า');

    const allowed = STOCK_IMPORT_TRANSITIONS[target.status] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error('ไม่สามารถเปลี่ยนสถานะใบนำเข้านี้ได้');
    }

    let syncedProducts = null;
    if (nextStatus === STOCK_IMPORT_STATUS.COMPLETED) {
      syncedProducts = await applyImportItemsToStock(
        target.items,
        currentProducts,
        isSupabaseActive,
        nowIso
      );
    }

    const savedImport = {
      ...target,
      status: nextStatus,
      status_history: [...target.status_history, { status: nextStatus, at: nowIso }],
      updated_at: nowIso,
    };

    const updatedImports = existingImports.map((imp) =>
      imp.id === importId ? savedImport : imp
    );
    setLocal(STORAGE_KEYS.STOCK_IMPORTS, updatedImports);

    return { savedImport, updatedImports, updatedProducts: syncedProducts };
  },

  /**
   * รีเซ็ตข้อมูลสาธิตกลับเป็นค่าเริ่มต้น
   */
  resetDemoData() {
    setLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
    setLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const resetProducts = normalizeAndSyncProducts(INITIAL_PRODUCTS);
    setLocal(STORAGE_KEYS.PRODUCTS, resetProducts);
    setLocal(STORAGE_KEYS.PRODUCT_META, {});
    setLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    setLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
    setLocal(STORAGE_KEYS.CUSTOMER_META, {});
    setLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    setLocal(STORAGE_KEYS.STOCK_IMPORTS, []);
    setLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    setLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    syncInitialWholesaleRulesWithProducts(resetProducts, []);
  },
};
