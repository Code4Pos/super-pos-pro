import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  INITIAL_CATEGORIES,
  INITIAL_UNITS,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
} from '../data/mockData';

const STORAGE_KEYS = {
  PRODUCTS: 'siampos_products_v1',
  TRASH_PRODUCTS: 'siampos_trash_products_v1',
  CATEGORIES: 'siampos_categories_v1',
  UNITS: 'siampos_units_v1',
  CUSTOMERS: 'siampos_customers_v1',
  ORDERS: 'siampos_orders_v1',
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

export const posService = {
  /**
   * โหลดข้อมูลทั้งหมดของระบบตอนเปิดแอป
   */
  async fetchAllData() {
    const localUnits = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const localTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);

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
        const activeList = (prodRes.data || []).filter((p) => !trashIds.has(p.id));

        return {
          mode: 'supabase',
          categories: categories.length > 1 ? categories : INITIAL_CATEGORIES,
          units: localUnits,
          products: normalizeAndSyncProducts(activeList),
          trashedProducts: localTrash,
          customers: cusRes.data || [],
          orders: ordRes.data || [],
        };
      } catch (err) {
        console.warn('Supabase connection error, falling back to Demo Mode:', err.message);
      }
    }

    // Fallback: โหมดสาธิต (LocalStorage)
    const rawProducts = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const normalized = normalizeAndSyncProducts(rawProducts);

    return {
      mode: 'demo',
      categories: getLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES),
      units: localUnits,
      products: normalized,
      trashedProducts: localTrash,
      customers: getLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS),
      orders: getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS),
    };
  },

  /**
   * เพิ่มหรือแก้ไขสินค้า (รองรับ selling_units และระบบสินค้าสัมพันธ์ linked_product_id / linked_deduct_qty)
   */
  async upsertProduct(productData, isSupabaseActive) {
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

    if (isSupabaseActive && supabase) {
      try {
        if (productData.id && !String(productData.id).startsWith('prod-')) {
          const { data, error } = await supabase
            .from('products')
            .update(cleanPayload)
            .eq('id', productData.id)
            .select()
            .single();
          if (error) throw error;
          return {
            ...data,
            selling_units: sanitizedSellingUnits,
            linked_product_id: linkedProductId,
            linked_deduct_qty: linkedDeductQty,
            updated_at: nowIso,
          };
        } else {
          const { data, error } = await supabase
            .from('products')
            .insert([cleanPayload])
            .select()
            .single();
          if (error) throw error;
          return {
            ...data,
            selling_units: sanitizedSellingUnits,
            linked_product_id: linkedProductId,
            linked_deduct_qty: linkedDeductQty,
            updated_at: nowIso,
          };
        }
      } catch (err) {
        console.warn('Supabase upsert fallback to local:', err.message);
      }
    }

    // โหมด Demo (LocalStorage)
    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    let updatedList = products;

    // กรณีบันทึกสินค้ารองที่มีการเชื่อมสินค้าสัมพันธ์ และมีการปรับแก้จำนวนสต็อกของสินค้ารอง ให้ซิงค์กลับไปที่สินค้าตัวหลักด้วย
    if (linkedProductId && productData.sync_master_stock) {
      const masterTarget = products.find((p) => p.id === linkedProductId);
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

    let targetId = productData.id;

    if (productData.id) {
      updatedList = updatedList.map((p) =>
        p.id === productData.id ? { ...p, ...cleanPayload, id: productData.id } : p
      );
    } else {
      targetId = `prod-${Date.now()}`;
      const newProduct = {
        ...cleanPayload,
        id: targetId,
        created_at: nowIso,
      };
      updatedList = [newProduct, ...updatedList];
    }

    const syncedList = normalizeAndSyncProducts(updatedList);
    setLocal(STORAGE_KEYS.PRODUCTS, syncedList);
    return syncedList.find((p) => p.id === targetId);
  },

  /**
   * ย้ายสินค้าไปไว้ในถังขยะ (Soft Delete)
   * พร้อมยกเลิกการเชื่อมสินค้าสัมพันธ์ในสินค้ารองทั้งหมดที่อ้างอิงถึงสินค้าตัวหลักนี้ทันที
   */
  async moveProductToTrash(productId, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
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
  async updateStock(productId, newStock, isSupabaseActive, newCostPrice = undefined) {
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
    const products = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const updated = products.map((p) => {
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
   * เพิ่มหรือแก้ไขข้อมูลลูกค้า (ปลีก / ยี่ปั๊วขายส่ง)
   */
  async upsertCustomer(customerData, isSupabaseActive) {
    const payload = {
      code: (customerData.code || `CUS-${Date.now().toString().slice(-4)}`).trim(),
      name: customerData.name.trim(),
      phone: (customerData.phone || '').trim(),
      customer_type: customerData.customer_type || 'retail',
      shop_name: (customerData.shop_name || '').trim(),
      address: (customerData.address || '').trim(),
    };

    if (isSupabaseActive && supabase) {
      if (customerData.id && !String(customerData.id).startsWith('cus-')) {
        const { data, error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', customerData.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('customers')
          .insert([{ ...payload, total_spent: 0, order_count: 0, points: 0 }])
          .select()
          .single();
        if (error) throw error;
        return data;
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

        const { data: savedOrder, error: orderError } = await supabase
          .from('orders')
          .insert([supabaseOrderData])
          .select()
          .single();

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
   * รีเซ็ตข้อมูลสาธิตกลับเป็นค่าเริ่มต้น
   */
  resetDemoData() {
    setLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
    setLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    setLocal(
      STORAGE_KEYS.PRODUCTS,
      normalizeAndSyncProducts(INITIAL_PRODUCTS)
    );
    setLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    setLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
    setLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
  },
};
