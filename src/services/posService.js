import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { B2B_CUSTOMER_DEFAULTS, normalizeB2BFields } from '../utils/credit';
import { calculateOrderVat, getNextTaxInvoiceNumber, getTaxInvoicePrefix } from '../utils/tax';
import { hashPin, generateSalt } from '../utils/rbac';
import { consumeLots, addToLots, restoreToLots, summarizeLotsByProduct } from '../utils/lots';
import { normalizeWarehouses, applyBalanceDelta, TRANSIT_WAREHOUSE_ID } from '../utils/warehouses';
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
  CUSTOMER_PAYMENTS: 'siampos_customer_payments_v1',
  BILLING_NOTES: 'siampos_billing_notes_v1',
  STOCK_LEDGER: 'siampos_stock_ledger_v1',
  TAX_INVOICES: 'siampos_tax_invoices_v1',
  USERS: 'siampos_users_v1',
  TAX_NOTES: 'siampos_tax_notes_v1',
  STOCK_COUNTS: 'siampos_stock_counts_v1',
  WAREHOUSES: 'siampos_warehouses_v1',
  INVENTORY_BALANCES: 'siampos_inventory_balances_v1',
  STOCK_TRANSFERS: 'siampos_stock_transfers_v1',
  PRODUCT_LOTS: 'siampos_product_lots_v1',
  OFFLINE_QUEUE: 'siampos_offline_queue_v1',
  OFFLINE_FAILED: 'siampos_offline_failed_v1',
  SUPABASE_CACHE_AT: 'siampos_supabase_cache_at_v1',
  LOT_CONSUMPTIONS: 'siampos_lot_consumptions_v1',
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
/**
 * โหลดเอกสารจากตารางใน Supabase แล้วรวมกับรายการที่บันทึกไว้ในเครื่อง (ไม่ซ้ำ id)
 * ถ้ายังไม่ได้สร้างตาราง (ยังไม่รัน Migration) จะใช้ข้อมูลในเครื่องอย่างเดียว
 */
async function loadRemoteWithLocal(table, storageKey, limit = 1000) {
  const localRows = getLocal(storageKey, []);
  try {
    const res = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (res.error || !Array.isArray(res.data)) return localRows;
    const remoteIds = new Set(res.data.map((r) => r.id));
    return [...res.data, ...localRows.filter((r) => !remoteIds.has(r.id))];
  } catch {
    return localRows;
  }
}

/**
 * บันทึกเอกสารลง Supabase (ถ้าใช้งานอยู่) แล้วเก็บสำเนาในเครื่องเสมอ
 * คืนค่าเอกสารที่บันทึก และรายการทั้งหมดในเครื่อง
 */
async function insertRemoteWithLocal(table, storageKey, record, localIdPrefix, isSupabaseActive) {
  let saved = { ...record, id: `${localIdPrefix}-${Date.now()}` };
  if (
    isSupabaseActive &&
    supabase &&
    record.customer_id &&
    !String(record.customer_id).startsWith('cus-')
  ) {
    try {
      const { data, error } = await supabase.from(table).insert([record]).select().single();
      if (!error && data) saved = data;
    } catch (err) {
      console.warn(`Supabase ${table} fallback:`, err.message);
    }
  }
  const updated = [saved, ...getLocal(storageKey, [])];
  setLocal(storageKey, updated);
  return { saved, updated };
}

/**
 * บันทึกเอกสารภาษีพร้อมออกเลขที่เรียงต่อเนื่องรายเดือน (ห้ามซ้ำ)
 * โหมด Supabase อ่านเลขล่าสุดจากฐานข้อมูลก่อน และลองเลขถัดไปเมื่อชน unique กับเครื่องอื่น
 */
async function insertWithRunningNumber({
  table,
  storageKey,
  numberField,
  code,
  baseRecord,
  existingNumbers = [],
  isSupabaseActive,
  now = new Date(),
}) {
  const usedNumbers = [...existingNumbers];
  const remoteEnabled = isSupabaseActive && supabase;
  if (remoteEnabled) {
    try {
      const { data } = await supabase
        .from(table)
        .select(numberField)
        .like(numberField, `${getTaxInvoicePrefix(now, code)}%`);
      (data || []).forEach((r) => usedNumbers.push(r[numberField]));
    } catch {
      // ยังไม่มีตาราง ใช้เลขจากในเครื่อง
    }
  }

  const localId = () => `${code.toLowerCase()}-${Date.now()}`;
  let saved = null;
  for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
    const record = { ...baseRecord, [numberField]: getNextTaxInvoiceNumber(usedNumbers, now, code) };
    if (!remoteEnabled) {
      saved = { ...record, id: localId() };
      break;
    }
    try {
      const { data, error } = await supabase.from(table).insert([record]).select().single();
      if (!error && data) {
        saved = data;
      } else if (error?.code === '23505') {
        // เลขที่ชนกับเครื่องอื่น ลองเลขถัดไป
        usedNumbers.push(record[numberField]);
      } else {
        saved = { ...record, id: localId() };
      }
    } catch {
      saved = { ...record, id: localId() };
    }
  }
  if (!saved) throw new Error('ไม่สามารถออกเลขที่เอกสารได้ กรุณาลองใหม่');

  const updated = [saved, ...getLocal(storageKey, [])];
  setLocal(storageKey, updated);
  return { saved, updated };
}

// รวมข้อมูลจากฐานข้อมูลกับในเครื่องตาม id โดยยึดฉบับที่แก้ไขล่าสุด (updated_at) เช่น ผู้ใช้งาน ใบตรวจนับ
function mergeByLatestUpdate(remoteUsers = [], localUsers = []) {
  const byId = new Map();
  [...localUsers, ...remoteUsers].forEach((u) => {
    const prev = byId.get(u.id);
    if (!prev || new Date(u.updated_at || 0) >= new Date(prev.updated_at || 0)) byId.set(u.id, u);
  });
  return [...byId.values()];
}

// จำนวนรายการ Stock Ledger สูงสุดที่เก็บในเครื่อง (กันพื้นที่ LocalStorage เต็ม)
const MAX_LOCAL_LEDGER_ENTRIES = 3000;

/**
 * เปรียบเทียบสต็อกก่อน-หลังทำรายการ แล้วสร้างรายการเคลื่อนไหวสต็อก (Stock Ledger)
 * บันทึกเฉพาะสินค้าที่ถือสต็อกจริง (ไม่ใช่สินค้ารองที่เชื่อมกับสินค้าหลัก) และมีจำนวนเปลี่ยน
 */
function buildStockMovements(beforeProducts = [], afterProducts = [], meta = {}) {
  const beforeMap = new Map(beforeProducts.map((p) => [p.id, p]));
  const nowIso = new Date().toISOString();
  return afterProducts
    .filter((p) => !p.linked_product_id)
    .map((p, idx) => {
      const before = beforeMap.get(p.id);
      const beforeStock = before ? Number(before.stock) || 0 : 0;
      const afterStock = Number(p.stock) || 0;
      return {
        id: `stk-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        product_id: p.id,
        product_name: p.name,
        sku: p.sku || '',
        unit: p.unit || 'ชิ้น',
        movement_type: before ? meta.movement_type || 'ADJUST' : 'OPENING',
        change_qty: Math.round((afterStock - beforeStock) * 10000) / 10000,
        balance_after: afterStock,
        reference_doc: meta.reference_doc || '',
        reason: meta.reason || '',
        approved_by: meta.approved_by || '',
        created_at: nowIso,
      };
    })
    .filter((m) => m.change_qty !== 0);
}

/**
 * บันทึกรายการเคลื่อนไหวสต็อกลงเครื่อง (และ Supabase ถ้าใช้งานอยู่และมีตาราง stock_ledger)
 */
async function recordStockMovements(beforeProducts, afterProducts, meta, isSupabaseActive) {
  const entries = buildStockMovements(beforeProducts, afterProducts, meta);
  if (entries.length === 0) return entries;

  const ledger = getLocal(STORAGE_KEYS.STOCK_LEDGER, []);
  setLocal(STORAGE_KEYS.STOCK_LEDGER, [...entries, ...ledger].slice(0, MAX_LOCAL_LEDGER_ENTRIES));

  // ใช้ id เดียวกับในเครื่อง เพื่อรวมข้อมูลจากฐานข้อมูลกับในเครื่องโดยไม่ซ้ำกัน
  const remoteEntries = entries.filter((e) => !String(e.product_id).startsWith('prod-'));
  if (isSupabaseActive && supabase && remoteEntries.length > 0) {
    await upsertOrQueue('stock_ledger', remoteEntries);
  }
  await syncLotsWithMovements(entries, afterProducts, meta, isSupabaseActive);
  return entries;
}

/**
 * ปรับล็อตของสินค้าที่ติดตาม Lot ตามการเคลื่อนไหวสต็อก (ทุกจุดที่สต็อกเปลี่ยนผ่าน recordStockMovements)
 * - สต็อกลด: ตัดล็อตตาม FEFO/FIFO และจำประวัติการตัดตามเลขที่เอกสาร
 * - ยกเลิกบิล (VOID): คืนเข้าล็อตเดิมที่บิลนั้นตัดไป
 * - รับสินค้าเข้า (IMPORT): สร้างล็อตตามเลขล็อต/วันหมดอายุที่ระบุในใบนำเข้า
 * - อื่นๆ ที่สต็อกเพิ่ม: เข้า "ไม่ระบุล็อต"
 */
async function syncLotsWithMovements(entries, afterProducts, meta = {}, isSupabaseActive) {
  const productMap = new Map(afterProducts.map((p) => [p.id, p]));
  const tracked = entries.filter((e) => productMap.get(e.product_id)?.track_lots);
  if (tracked.length === 0) return;

  const nowIso = new Date().toISOString();
  const beforeLots = getLocal(STORAGE_KEYS.PRODUCT_LOTS, []);
  let lots = beforeLots;
  let consumptions = getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []);

  tracked.forEach((entry) => {
    const product = productMap.get(entry.product_id);
    const strategy = product.lot_strategy || 'FEFO';
    const delta = Number(entry.change_qty) || 0;

    if (delta < 0) {
      const result = consumeLots(lots, product.id, -delta, strategy, nowIso);
      lots = result.lots;
      if (meta.reference_doc && result.consumed.length > 0) {
        consumptions = [
          { reference_doc: meta.reference_doc, product_id: product.id, consumed: result.consumed, at: nowIso },
          ...consumptions,
        ].slice(0, MAX_LOCAL_LEDGER_ENTRIES);
      }
      return;
    }

    if (meta.movement_type === 'VOID') {
      const log = consumptions.find(
        (c) => c.reference_doc === meta.reference_doc && c.product_id === product.id
      );
      lots = restoreToLots(lots, product, log?.consumed || [], delta, meta, nowIso);
      consumptions = consumptions.filter((c) => c !== log);
      return;
    }

    let remaining = delta;
    (meta.lotInfos?.[product.id] || []).forEach((info) => {
      const qty = Math.min(remaining, Number(info.qty) || 0);
      if (qty <= 0) return;
      lots = addToLots(lots, product, qty, info, meta, nowIso);
      remaining -= qty;
    });
    if (remaining > 0) lots = addToLots(lots, product, remaining, null, meta, nowIso);
  });

  setLocal(STORAGE_KEYS.PRODUCT_LOTS, lots);
  setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, consumptions);
  await upsertChangedLots(beforeLots, lots, isSupabaseActive);
}

// ส่งเฉพาะล็อตที่เพิ่ม/เปลี่ยนขึ้น Supabase (ตาราง product_lots ใช้ id จากฝั่งแอป)
async function upsertChangedLots(beforeLots, afterLots, isSupabaseActive) {
  if (!isSupabaseActive || !supabase) return;
  // ฟังก์ชันใน lots.js สร้าง object ใหม่เฉพาะล็อตที่เปลี่ยน (เทียบ object แทนเวลา กันกรณีทำรายการในมิลลิวินาทีเดียวกัน)
  const unchanged = new Set(beforeLots);
  const changed = afterLots.filter((l) => !unchanged.has(l));
  if (changed.length === 0) return;
  await upsertOrQueue('product_lots', changed);
}

// =================================================================================
// โหมดออฟไลน์ (Offline-First): บิลขายและข้อมูลที่ใช้ id ฝั่งแอป เข้าคิวเมื่อเน็ตหลุด แล้วซิงค์ทีหลัง
// =================================================================================

export function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// ข้อผิดพลาดที่เกิดจากเชื่อมต่อไม่ได้ (ไม่ใช่ข้อผิดพลาดของข้อมูล) ควรเก็บเข้าคิวรอซิงค์
export function isNetworkError(err) {
  if (!isOnline()) return true;
  return /failed to fetch|fetch failed|network|load failed|timeout/i.test(String(err?.message || err || ''));
}

// กันการซิงค์คิวซ้อนกัน (เช่น กดปุ่มซิงค์ระหว่างที่ซิงค์อัตโนมัติ)
let offlineFlushRunning = false;

function enqueueOffline(item) {
  const queue = getLocal(STORAGE_KEYS.OFFLINE_QUEUE, []);
  setLocal(STORAGE_KEYS.OFFLINE_QUEUE, [
    ...queue,
    { ...item, id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, queued_at: new Date().toISOString() },
  ]);
}

/**
 * upsert ข้อมูลที่ใช้ id ฝั่งแอป (ไม่ซ้ำเมื่อส่งซ้ำ) ถ้าเชื่อมต่อไม่ได้ให้เก็บเข้าคิว
 */
async function upsertOrQueue(table, rows) {
  if (!isOnline()) {
    enqueueOffline({ kind: 'upsert', table, rows });
    return false;
  }
  try {
    const { error } = await supabase.from(table).upsert(rows);
    if (!error) return true;
    if (isNetworkError(error)) enqueueOffline({ kind: 'upsert', table, rows });
    else console.warn(`Supabase ${table} error:`, error.message);
  } catch (err) {
    if (isNetworkError(err)) enqueueOffline({ kind: 'upsert', table, rows });
    else console.warn(`Supabase ${table} error:`, err.message);
  }
  return false;
}

/**
 * ส่งบิลขายขึ้น Supabase แล้วตัดสต็อกจากยอดล่าสุดในฐานข้อมูล (ไม่ใช้ค่าที่แคชไว้)
 * - ฐานข้อมูลที่ยังไม่ได้รัน Migration: ลองบันทึกแบบเดิม (ไม่มี payments / credit_due_date / created_by_name)
 * คืนค่า { ok, networkError }
 */
async function pushOrderToSupabase(orderData, deductions = []) {
  try {
    let { data: savedOrder, error: orderError } = await supabase
      .from('orders')
      .insert([orderData])
      .select()
      .single();

    if (orderError && isNetworkError(orderError)) return { ok: false, networkError: true };
    if (orderError?.code === '23505') return { ok: true }; // เลขที่บิลนี้ถูกบันทึกไปแล้ว (ซิงค์ซ้ำ)

    if (orderError) {
      const payments = Array.isArray(orderData.payments) ? orderData.payments : [];
      const mainPayment = [...payments].sort((a, b) => b.amount - a.amount)[0];
      const legacyOrderData = { ...orderData };
      delete legacyOrderData.payments;
      delete legacyOrderData.credit_due_date;
      delete legacyOrderData.created_by_name;
      legacyOrderData.payment_method =
        orderData.payment_method === 'split' ? mainPayment?.method || 'cash' : orderData.payment_method;
      ({ data: savedOrder, error: orderError } = await supabase
        .from('orders')
        .insert([legacyOrderData])
        .select()
        .single());
      if (orderError && isNetworkError(orderError)) return { ok: false, networkError: true };
    }
    if (orderError || !savedOrder) {
      console.warn('Supabase order error:', orderError?.message);
      return { ok: false, networkError: false };
    }

    const ids = deductions.map(([id]) => id);
    if (ids.length > 0) {
      const { data: rows } = await supabase.from('products').select('id, stock').in('id', ids);
      const deductById = new Map(deductions);
      const nowIso = new Date().toISOString();
      for (const row of rows || []) {
        await supabase
          .from('products')
          .update({ stock: Math.max(0, (Number(row.stock) || 0) - deductById.get(row.id)), updated_at: nowIso })
          .eq('id', row.id);
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, networkError: isNetworkError(err) };
  }
}

/**
 * รวมข้อมูลลูกค้ากับข้อมูลเสริมที่เก็บในเครื่อง (ราคาพิเศษ และข้อมูล B2B/เครดิต)
 * ใช้ค่าจากฐานข้อมูลก่อน ถ้าฐานข้อมูลยังไม่มีคอลัมน์นั้นจึงใช้ค่าในเครื่อง
 */
function mergeCustomerMeta(customer, customerMeta = {}) {
  const cMeta = customerMeta[customer.id] || customerMeta[customer.code] || {};
  const pick = (key) => (customer[key] !== undefined && customer[key] !== null ? customer[key] : cMeta[key]);
  return {
    ...customer,
    special_price_tier: Number(pick('special_price_tier')) || 0,
    ...normalizeB2BFields({
      ...B2B_CUSTOMER_DEFAULTS,
      tax_id: pick('tax_id'),
      branch_number: pick('branch_number'),
      credit_limit: pick('credit_limit'),
      credit_term_days: pick('credit_term_days'),
      is_blocked: pick('is_blocked'),
    }),
  };
}

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
 * ต้นทุนเฉลี่ยเคลื่อนที่ (Moving Average Cost)
 * = (สต็อกเดิม x ต้นทุนเดิม + มูลค่าที่รับเข้า) / (สต็อกเดิม + จำนวนที่รับเข้า)
 * ถ้าสต็อกเดิมเป็น 0 หรือติดลบ ใช้ต้นทุนของล็อตที่รับเข้าใหม่
 */
export function calculateMovingAverageCost(oldStock, oldCost, addQty, addValue) {
  const prevQty = Math.max(0, Number(oldStock) || 0);
  const qty = Math.max(0, Number(addQty) || 0);
  if (qty <= 0) return Number(oldCost) || 0;
  const totalQty = prevQty + qty;
  const totalValue = prevQty * (Number(oldCost) || 0) + (Number(addValue) || 0);
  return Number((totalValue / totalQty).toFixed(4));
}

/**
 * เพิ่มสต็อกและอัปเดตต้นทุนเฉลี่ยเคลื่อนที่จากรายการในใบนำเข้า
 * พร้อมแปลงจำนวนของสินค้ารองกลับไปบวกเข้าสินค้าหลัก แล้วซิงค์สต็อกสินค้าสัมพันธ์
 * มูลค่ารับเข้าใช้ยอดรวมหลังหักส่วนลดของแต่ละแถว (line_total)
 */
async function applyImportItemsToStock(
  items = [],
  currentProducts = null,
  isSupabaseActive = false,
  nowIso = new Date().toISOString(),
  referenceDoc = ''
) {
  const baseProducts =
    Array.isArray(currentProducts) && currentProducts.length > 0
      ? currentProducts
      : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  const prodMap = new Map(baseProducts.map((p) => [p.id, p]));

  const addStockByProductId = new Map();
  const addValueByProductId = new Map();
  // ข้อมูลล็อตจากใบนำเข้า (เฉพาะสินค้าหลักที่ติดตาม Lot) จำนวนเป็นหน่วยฐานของสินค้าหลัก
  const lotInfos = {};

  for (const item of items) {
    const targetProd = prodMap.get(item.product_id);
    if (!targetProd) continue;
    const qty = Math.max(1, Number(item.quantity) || 1);
    const importPrice = Math.max(0, Number(item.import_price) || 0);
    const lineValue =
      item.line_total !== undefined && item.line_total !== null
        ? Math.max(0, Number(item.line_total) || 0)
        : qty * importPrice;

    // กรณีนำเข้าสินค้ารองที่เชื่อมกับสินค้าหลัก ให้แปลงจำนวนกลับไปบวกเข้าสินค้าหลัก
    const targetId = targetProd.linked_product_id || targetProd.id;
    const mult = targetProd.linked_product_id
      ? Math.max(1, Number(targetProd.linked_deduct_qty) || 1)
      : 1;
    addStockByProductId.set(targetId, (addStockByProductId.get(targetId) || 0) + qty * mult);
    addValueByProductId.set(targetId, (addValueByProductId.get(targetId) || 0) + lineValue);
    if (prodMap.get(targetId)?.track_lots && (item.lot_number || item.expiry_date)) {
      lotInfos[targetId] = [
        ...(lotInfos[targetId] || []),
        {
          lot_number: item.lot_number || '',
          expiry_date: item.expiry_date || null,
          qty: qty * mult,
          cost_price: qty * mult > 0 ? lineValue / (qty * mult) : 0,
        },
      ];
    }
  }

  const newCostByProductId = new Map();
  for (const [pid, addQty] of addStockByProductId.entries()) {
    const prod = prodMap.get(pid);
    if (!prod) continue;
    newCostByProductId.set(
      pid,
      calculateMovingAverageCost(prod.stock, prod.cost_price, addQty, addValueByProductId.get(pid))
    );
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
  await recordStockMovements(
    baseProducts,
    syncedProducts,
    { movement_type: 'IMPORT', reference_doc: referenceDoc, lotInfos },
    isSupabaseActive
  );
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

    let offlineFallback = false;
    if (isSupabaseConfigured && supabase) {
      try {
        // ซิงค์บิลที่ค้างจากตอนออฟไลน์ก่อน เพื่อให้ข้อมูลที่โหลดมาเป็นยอดล่าสุด
        await this.flushOfflineQueue();
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
              lead_time_days: p.lead_time_days ?? meta.lead_time_days,
              safety_stock: p.safety_stock ?? meta.safety_stock,
              track_lots: p.track_lots ?? meta.track_lots ?? false,
              lot_strategy: p.lot_strategy ?? meta.lot_strategy ?? 'FEFO',
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

        const mergedCustomers = (cusRes.data || []).map((c) =>
          mergeCustomerMeta(c, localCustomerMeta)
        );

        // ยอดรับชำระหนี้ และใบวางบิล (ถ้ายังไม่มีตารางในฐานข้อมูลให้ใช้ข้อมูลในเครื่อง)
        const [customerPayments, billingNotes, stockLedger, taxInvoices, remoteUsers, taxNotes, remoteCounts, remoteLots] =
          await Promise.all([
            loadRemoteWithLocal('customer_payments', STORAGE_KEYS.CUSTOMER_PAYMENTS),
            loadRemoteWithLocal('billing_notes', STORAGE_KEYS.BILLING_NOTES),
            loadRemoteWithLocal('stock_ledger', STORAGE_KEYS.STOCK_LEDGER, MAX_LOCAL_LEDGER_ENTRIES),
            loadRemoteWithLocal('tax_invoices', STORAGE_KEYS.TAX_INVOICES, 5000),
            loadRemoteWithLocal('app_users', STORAGE_KEYS.USERS),
            loadRemoteWithLocal('tax_notes', STORAGE_KEYS.TAX_NOTES, 5000),
            loadRemoteWithLocal('stock_counts', STORAGE_KEYS.STOCK_COUNTS, 500),
            loadRemoteWithLocal('product_lots', STORAGE_KEYS.PRODUCT_LOTS, 5000),
          ]);
        // คลังสินค้า ยอดแยกคลัง และใบโอน (ใช้ id ฝั่งแอป ยึดฉบับที่อัปเดตล่าสุด)
        const [remoteWarehouses, remoteBalances, remoteTransfers] = await Promise.all([
          loadRemoteWithLocal('warehouses', STORAGE_KEYS.WAREHOUSES, 200),
          loadRemoteWithLocal('inventory_balances', STORAGE_KEYS.INVENTORY_BALANCES, 10000),
          loadRemoteWithLocal('stock_transfers', STORAGE_KEYS.STOCK_TRANSFERS, 500),
        ]);
        const warehouses = normalizeWarehouses(mergeByLatestUpdate(remoteWarehouses, getLocal(STORAGE_KEYS.WAREHOUSES, [])));
        const inventoryBalances = mergeByLatestUpdate(remoteBalances, getLocal(STORAGE_KEYS.INVENTORY_BALANCES, []));
        const stockTransfers = mergeByLatestUpdate(remoteTransfers, getLocal(STORAGE_KEYS.STOCK_TRANSFERS, []));
        setLocal(STORAGE_KEYS.INVENTORY_BALANCES, inventoryBalances);
        setLocal(STORAGE_KEYS.STOCK_TRANSFERS, stockTransfers);
        // ใบตรวจนับและล็อตแก้ไขได้หลายครั้ง จึงยึดฉบับที่อัปเดตล่าสุด
        const stockCounts = mergeByLatestUpdate(remoteCounts, getLocal(STORAGE_KEYS.STOCK_COUNTS, []));
        const productLots = mergeByLatestUpdate(remoteLots, getLocal(STORAGE_KEYS.PRODUCT_LOTS, []));
        setLocal(STORAGE_KEYS.PRODUCT_LOTS, productLots);
        // ผู้ใช้จากฐานข้อมูลเป็นค่าหลัก (แก้จากเครื่องอื่นได้) เก็บสำเนาในเครื่องไว้ใช้ตอน Offline
        const users = mergeByLatestUpdate(remoteUsers, getLocal(STORAGE_KEYS.USERS, []));
        setLocal(STORAGE_KEYS.USERS, users);
        // เก็บสำเนาข้อมูลจริงไว้ในเครื่อง เปิดแอปตอนเน็ตหลุดจะใช้แคชนี้แทนข้อมูลสาธิต
        if (categories.length > 1) setLocal(STORAGE_KEYS.CATEGORIES, categories);
        setLocal(STORAGE_KEYS.CUSTOMERS, cusRes.data || []);
        setLocal(STORAGE_KEYS.ORDERS, ordRes.data || []);
        setLocal(STORAGE_KEYS.SUPABASE_CACHE_AT, new Date().toISOString());

        return {
          mode: 'supabase',
          categories: categories.length > 1 ? categories : INITIAL_CATEGORIES,
          units: localUnits,
          products: syncedSupaProducts,
          trashedProducts: localTrash,
          customers: mergedCustomers,
          customerPayments,
          billingNotes,
          stockLedger,
          taxInvoices,
          taxNotes,
          stockCounts,
          warehouses,
          inventoryBalances,
          stockTransfers,
          productLots,
          users,
          suppliers,
          stockImports,
          orders: ordRes.data || [],
          wholesaleRules,
          specialRules,
        };
      } catch (err) {
        // เน็ตหลุดและเคยโหลดข้อมูลจริงไว้แล้ว = ทำงานต่อด้วยข้อมูลในเครื่อง (ยังเป็นโหมด Supabase แต่ออฟไลน์)
        offlineFallback = isNetworkError(err) && Boolean(getLocal(STORAGE_KEYS.SUPABASE_CACHE_AT, null));
        console.warn(
          offlineFallback
            ? 'Supabase offline, using cached data:'
            : 'Supabase connection error, falling back to Demo Mode:',
          err.message
        );
      }
    }

    // Fallback: ข้อมูลในเครื่อง (โหมดสาธิต หรือแคชของโหมด Supabase ตอนออฟไลน์)
    const rawProducts = getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const normalized = normalizeAndSyncProducts(rawProducts);
    setLocal(STORAGE_KEYS.PRODUCTS, normalized);

    const wholesaleRules = syncInitialWholesaleRulesWithProducts(
      normalized,
      rawWholesaleRules
    );

    const localCustomers = getLocal(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS).map(
      (c) => mergeCustomerMeta(c, localCustomerMeta)
    );

    return {
      mode: offlineFallback ? 'supabase' : 'demo',
      offline: offlineFallback,
      categories: getLocal(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES),
      units: localUnits,
      products: normalized,
      trashedProducts: localTrash,
      customers: localCustomers,
      customerPayments: getLocal(STORAGE_KEYS.CUSTOMER_PAYMENTS, []),
      billingNotes: getLocal(STORAGE_KEYS.BILLING_NOTES, []),
      stockLedger: getLocal(STORAGE_KEYS.STOCK_LEDGER, []),
      taxInvoices: getLocal(STORAGE_KEYS.TAX_INVOICES, []),
      taxNotes: getLocal(STORAGE_KEYS.TAX_NOTES, []),
      stockCounts: getLocal(STORAGE_KEYS.STOCK_COUNTS, []),
      warehouses: normalizeWarehouses(getLocal(STORAGE_KEYS.WAREHOUSES, [])),
      inventoryBalances: getLocal(STORAGE_KEYS.INVENTORY_BALANCES, []),
      stockTransfers: getLocal(STORAGE_KEYS.STOCK_TRANSFERS, []),
      productLots: getLocal(STORAGE_KEYS.PRODUCT_LOTS, []),
      users: getLocal(STORAGE_KEYS.USERS, []),
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
    // รวมกับข้อมูลเดิม เพื่อไม่ให้ค่าที่ตั้งจากหน้าอื่น (เช่น จุดสั่งซื้อ) หายไป
    localMeta[targetId] = { ...(localMeta[targetId] || {}), ...metaEntry };
    localMeta[cleanPayload.sku] = { ...(localMeta[cleanPayload.sku] || {}), ...metaEntry };
    setLocal(STORAGE_KEYS.PRODUCT_META, localMeta);

    const mergedProduct = {
      ...(savedSupaRow || {}),
      ...cleanPayload,
      id: targetId,
      created_at: savedSupaRow?.created_at || productData.created_at || nowIso,
    };

    // ค่าจุดสั่งซื้อไม่ได้อยู่ในฟอร์มสินค้า จึงคงค่าเดิมไว้
    const keepReorderFields = (p) => ({
      ...mergedProduct,
      lead_time_days: mergedProduct.lead_time_days ?? p.lead_time_days,
      safety_stock: mergedProduct.safety_stock ?? p.safety_stock,
      // ค่าการติดตาม Lot ตั้งจากหน้า Lot / วันหมดอายุ ไม่ได้อยู่ในฟอร์มสินค้า
      track_lots: mergedProduct.track_lots ?? p.track_lots,
      lot_strategy: mergedProduct.lot_strategy ?? p.lot_strategy,
    });

    if (productData.id && updatedList.some((p) => p.id === productData.id)) {
      updatedList = updatedList.map((p) =>
        p.id === productData.id ? keepReorderFields(p) : p
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
    // สินค้าใหม่ที่มีสต็อกตั้งต้น = OPENING, แก้จำนวนสต็อกในฟอร์มสินค้า = EDIT
    await recordStockMovements(
      baseProducts,
      syncedList,
      { movement_type: 'EDIT', reference_doc: 'แก้ไขข้อมูลสินค้า' },
      isSupabaseActive
    );

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
    currentProducts = null,
    movementMeta = {}
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
    await recordStockMovements(
      baseProducts,
      synced,
      { movement_type: 'ADJUST', ...movementMeta },
      isSupabaseActive
    );
    return synced;
  },

  /**
   * ตั้งค่าจุดสั่งซื้อของสินค้า: ระยะเวลารอสินค้า (วัน) และสต็อกสำรอง
   * ค่า null = ใช้ค่าเริ่มต้น / เก็บสำรองใน PRODUCT_META เผื่อฐานข้อมูลยังไม่มีคอลัมน์
   */
  async updateReorderSettings(productId, settings, isSupabaseActive, currentProducts = null) {
    const toNullableNumber = (v) =>
      v === null || v === undefined || v === '' ? null : Math.max(0, Number(v) || 0);
    const patch = {
      lead_time_days: toNullableNumber(settings.lead_time_days),
      safety_stock: toNullableNumber(settings.safety_stock),
    };

    if (isSupabaseActive && supabase && !String(productId).startsWith('prod-')) {
      try {
        await supabase.from('products').update(patch).eq('id', productId);
      } catch {
        // ฐานข้อมูลยังไม่มีคอลัมน์ ใช้ค่าในเครื่องแทน
      }
    }

    const baseProducts =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const target = baseProducts.find((p) => p.id === productId);
    const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    localMeta[productId] = { ...(localMeta[productId] || {}), ...patch };
    if (target?.sku) localMeta[target.sku] = { ...(localMeta[target.sku] || {}), ...patch };
    setLocal(STORAGE_KEYS.PRODUCT_META, localMeta);

    const updated = baseProducts.map((p) => (p.id === productId ? { ...p, ...patch } : p));
    setLocal(STORAGE_KEYS.PRODUCTS, updated);
    return updated;
  },

  /**
   * เพิ่ม/แก้ไขคลังสินค้า (id ฝั่งแอป)
   */
  async saveWarehouse(warehouse, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const saved = {
      ...warehouse,
      id: warehouse.id || `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      created_at: warehouse.created_at || nowIso,
      updated_at: nowIso,
    };
    const list = normalizeWarehouses(getLocal(STORAGE_KEYS.WAREHOUSES, []));
    const exists = list.some((w) => w.id === saved.id);
    const updated = normalizeWarehouses(exists ? list.map((w) => (w.id === saved.id ? saved : w)) : [...list, saved]);
    setLocal(STORAGE_KEYS.WAREHOUSES, updated);
    if (isSupabaseActive && supabase) await upsertOrQueue('warehouses', [updated.find((w) => w.id === saved.id)]);
    return updated;
  },

  /**
   * บันทึกใบโอนสต็อกระหว่างคลัง และปรับยอดแยกคลังตามการเปลี่ยนสถานะ (Two-Step Transfer)
   * - สร้าง (in_transit): ตัดออกจากคลังต้นทาง เข้ายอด "ระหว่างโอน"
   * - รับเข้า (received): ย้ายจากยอดระหว่างโอนเข้าคลังปลายทาง
   * - ยกเลิก (cancelled): คืนยอดระหว่างโอนกลับคลังต้นทาง
   * สต็อกรวม (products.stock) ไม่เปลี่ยน จึงไม่บันทึก Stock Ledger
   */
  async saveStockTransfer(record, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const transfers = getLocal(STORAGE_KEYS.STOCK_TRANSFERS, []);
    const previous = transfers.find((t) => t.id === record.id) || null;
    const prevStatus = previous?.status || null;
    const nextStatus = record.status;
    const allowed =
      (!prevStatus && nextStatus === 'in_transit') ||
      (prevStatus === 'in_transit' && (nextStatus === 'received' || nextStatus === 'cancelled'));
    if (!allowed) throw new Error('สถานะใบโอนนี้เปลี่ยนแล้ว');

    const beforeBalances = getLocal(STORAGE_KEYS.INVENTORY_BALANCES, []);
    let balances = beforeBalances;
    (record.items || []).forEach((item) => {
      const qty = Number(item.qty) || 0;
      if (qty <= 0) return;
      if (nextStatus === 'in_transit') {
        balances = applyBalanceDelta(balances, record.from_warehouse_id, item.product_id, -qty, nowIso);
        balances = applyBalanceDelta(balances, TRANSIT_WAREHOUSE_ID, item.product_id, qty, nowIso);
      } else {
        const targetId = nextStatus === 'received' ? record.to_warehouse_id : record.from_warehouse_id;
        balances = applyBalanceDelta(balances, TRANSIT_WAREHOUSE_ID, item.product_id, -qty, nowIso);
        balances = applyBalanceDelta(balances, targetId, item.product_id, qty, nowIso);
      }
    });

    const saved = { ...record, updated_at: nowIso };
    const updatedTransfers = previous
      ? transfers.map((t) => (t.id === saved.id ? saved : t))
      : [saved, ...transfers];
    setLocal(STORAGE_KEYS.INVENTORY_BALANCES, balances);
    setLocal(STORAGE_KEYS.STOCK_TRANSFERS, updatedTransfers);

    if (isSupabaseActive && supabase) {
      // applyBalanceDelta สร้าง object ใหม่เฉพาะแถวที่เปลี่ยน (เทียบ object แทนเวลา กันกรณีทำรายการในมิลลิวินาทีเดียวกัน)
      const unchanged = new Set(beforeBalances);
      const changed = balances.filter((b) => !unchanged.has(b));
      await upsertOrQueue('stock_transfers', [saved]);
      if (changed.length > 0) await upsertOrQueue('inventory_balances', changed);
    }
    return { saved, transfers: updatedTransfers, balances };
  },

  /**
   * รายการที่รอซิงค์ขึ้น Supabase (บันทึกตอนออฟไลน์)
   */
  getOfflineQueue() {
    return getLocal(STORAGE_KEYS.OFFLINE_QUEUE, []);
  },

  /**
   * ซิงค์คิวออฟไลน์ขึ้น Supabase ตามลำดับ หยุดทันทีเมื่อยังเชื่อมต่อไม่ได้ (ทำต่อรอบหน้า)
   * รายการที่ผิดพลาดจากข้อมูล (ไม่ใช่เน็ต) จะถูกย้ายไปเก็บแยกเพื่อไม่ให้คิวค้าง
   * คืนค่า { synced, remaining, failed }
   */
  async flushOfflineQueue() {
    const queue = this.getOfflineQueue();
    if (!supabase || queue.length === 0 || !isOnline() || offlineFlushRunning) {
      return { synced: 0, remaining: queue.length, failed: 0 };
    }
    offlineFlushRunning = true;
    try {
    let synced = 0;
    let failed = 0;
    let index = 0;
    for (; index < queue.length; index += 1) {
      const item = queue[index];
      let result;
      if (item.kind === 'order') {
        result = await pushOrderToSupabase(item.order, item.deductions || []);
      } else {
        try {
          const { error } = await supabase.from(item.table).upsert(item.rows);
          result = { ok: !error, networkError: error ? isNetworkError(error) : false };
        } catch (err) {
          result = { ok: false, networkError: isNetworkError(err) };
        }
      }
      if (result.networkError) break;
      if (result.ok) synced += 1;
      else {
        failed += 1;
        const failedItems = getLocal(STORAGE_KEYS.OFFLINE_FAILED, []);
        setLocal(STORAGE_KEYS.OFFLINE_FAILED, [...failedItems, { ...item, failed_at: new Date().toISOString() }]);
      }
    }
    // รายการที่เข้าคิวเพิ่มระหว่างซิงค์ (ต่อท้ายคิว) ต้องเก็บไว้ด้วย
    const addedDuringFlush = this.getOfflineQueue().slice(queue.length);
    const remaining = [...queue.slice(index), ...addedDuringFlush];
    setLocal(STORAGE_KEYS.OFFLINE_QUEUE, remaining);
    return { synced, remaining: remaining.length, failed };
    } finally {
      offlineFlushRunning = false;
    }
  },

  /**
   * ล็อตสินค้าทั้งหมดที่บันทึกไว้ในเครื่อง
   */
  getProductLots() {
    return getLocal(STORAGE_KEYS.PRODUCT_LOTS, []);
  },

  /**
   * เปิด/ปิดการติดตาม Lot และตั้งกลยุทธ์ตัดสต็อก (FEFO/FIFO) ของสินค้าหลัก
   * เปิดครั้งแรก: สต็อกเดิมทั้งหมดเข้า "ไม่ระบุล็อต" เพื่อให้ยอดล็อตรวม = สต็อก
   */
  async updateLotSettings(productId, settings, isSupabaseActive, currentProducts = null) {
    const patch = {
      track_lots: Boolean(settings.track_lots),
      lot_strategy: settings.lot_strategy === 'FIFO' ? 'FIFO' : 'FEFO',
    };
    if (isSupabaseActive && supabase && !String(productId).startsWith('prod-')) {
      try {
        await supabase.from('products').update(patch).eq('id', productId);
      } catch {
        // ฐานข้อมูลยังไม่มีคอลัมน์ ใช้ค่าในเครื่องแทน
      }
    }
    const baseProducts =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const target = baseProducts.find((p) => p.id === productId);
    const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    localMeta[productId] = { ...(localMeta[productId] || {}), ...patch };
    if (target?.sku) localMeta[target.sku] = { ...(localMeta[target.sku] || {}), ...patch };
    setLocal(STORAGE_KEYS.PRODUCT_META, localMeta);

    const updated = baseProducts.map((p) => (p.id === productId ? { ...p, ...patch } : p));
    setLocal(STORAGE_KEYS.PRODUCTS, updated);

    let lots = this.getProductLots();
    if (patch.track_lots) {
      lots = await this.reconcileProductLots(productId, isSupabaseActive, updated);
    }
    return { updatedProducts: updated, updatedLots: lots };
  },

  /**
   * ปรับยอดล็อตรวมให้เท่าสต็อกจริง: ขาด = เพิ่ม "ไม่ระบุล็อต", เกิน = ตัดล็อตตามกลยุทธ์
   */
  async reconcileProductLots(productId, isSupabaseActive, currentProducts = null) {
    const products =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const product = products.find((p) => p.id === productId);
    const beforeLots = this.getProductLots();
    if (!product) return beforeLots;
    const lotTotal = summarizeLotsByProduct(beforeLots).get(productId) || 0;
    const diff = Math.round(((Number(product.stock) || 0) - lotTotal) * 10000) / 10000;
    let lots = beforeLots;
    if (diff > 0) {
      lots = addToLots(lots, product, diff, null, { reference_doc: 'ปรับยอดล็อตให้ตรงสต็อก' });
    } else if (diff < 0) {
      lots = consumeLots(lots, productId, -diff, product.lot_strategy || 'FEFO').lots;
    }
    setLocal(STORAGE_KEYS.PRODUCT_LOTS, lots);
    await upsertChangedLots(beforeLots, lots, isSupabaseActive);
    return lots;
  },

  /**
   * แก้ไขเลขล็อต/วันหมดอายุของล็อต (เช่น ระบุล็อตให้สต็อกที่เข้า "ไม่ระบุล็อต")
   */
  async updateLotDetails(lotId, details, isSupabaseActive) {
    const beforeLots = this.getProductLots();
    const nowIso = new Date().toISOString();
    const lots = beforeLots.map((l) =>
      l.id === lotId
        ? {
            ...l,
            lot_number: String(details.lot_number || '').trim() || l.lot_number,
            expiry_date: details.expiry_date || null,
            updated_at: nowIso,
          }
        : l
    );
    setLocal(STORAGE_KEYS.PRODUCT_LOTS, lots);
    await upsertChangedLots(beforeLots, lots, isSupabaseActive);
    return lots;
  },

  /**
   * บันทึกใบตรวจนับสต็อก (Cycle Count) ทั้งสร้างใหม่และอัปเดตสถานะ
   * ใบตรวจนับใช้ id จากฝั่งแอป เพื่อ upsert ได้ทั้งในเครื่องและ Supabase
   */
  async saveStockCount(record, isSupabaseActive) {
    const saved = { ...record, updated_at: new Date().toISOString() };
    if (isSupabaseActive && supabase) {
      try {
        await supabase.from('stock_counts').upsert([saved]);
      } catch (err) {
        console.warn('Supabase stock count fallback:', err.message);
      }
    }
    const counts = getLocal(STORAGE_KEYS.STOCK_COUNTS, []);
    const exists = counts.some((c) => c.id === saved.id);
    const updated = exists ? counts.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...counts];
    setLocal(STORAGE_KEYS.STOCK_COUNTS, updated);
    return { savedCount: saved, updatedCounts: updated };
  },

  /**
   * อนุมัติผลตรวจนับ: ปรับสต็อกตามผลต่าง (นับได้ - ยอดในระบบตอนส่งผลนับ)
   * บวกผลต่างเข้ากับยอดปัจจุบัน เพื่อไม่ทับยอดขายที่เกิดขึ้นระหว่างรออนุมัติ
   */
  async applyStockCountAdjustments(count, approvedBy, isSupabaseActive, currentProducts = null) {
    const nowIso = new Date().toISOString();
    const deltas = new Map();
    (count.items || []).forEach((it) => {
      if (it.counted_qty === null || it.counted_qty === undefined || it.counted_qty === '') return;
      const delta = (Number(it.counted_qty) || 0) - (Number(it.system_qty) || 0);
      if (delta !== 0) deltas.set(it.product_id, delta);
    });

    const baseProducts =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    if (deltas.size === 0) return baseProducts;

    if (isSupabaseActive && supabase) {
      const remoteIds = [...deltas.keys()].filter((id) => !String(id).startsWith('prod-'));
      if (remoteIds.length > 0) {
        try {
          const { data: rows } = await supabase.from('products').select('id, stock').in('id', remoteIds);
          for (const row of rows || []) {
            await supabase
              .from('products')
              .update({ stock: Math.max(0, (Number(row.stock) || 0) + deltas.get(row.id)), updated_at: nowIso })
              .eq('id', row.id);
          }
        } catch (err) {
          console.warn('Supabase cycle count fallback:', err.message);
        }
      }
    }

    const updated = normalizeAndSyncProducts(
      baseProducts.map((p) =>
        deltas.has(p.id)
          ? { ...p, stock: Math.max(0, (Number(p.stock) || 0) + deltas.get(p.id)), updated_at: nowIso }
          : p
      )
    );
    setLocal(STORAGE_KEYS.PRODUCTS, updated);
    await recordStockMovements(
      baseProducts,
      updated,
      {
        movement_type: 'ADJUST',
        reason: 'ตรวจนับสต็อก (Cycle Count)',
        reference_doc: count.count_number,
        approved_by: approvedBy,
      },
      isSupabaseActive
    );
    return updated;
  },

  /**
   * รายการเคลื่อนไหวสต็อกที่บันทึกไว้ในเครื่อง (ล่าสุดก่อน)
   */
  getStockLedger() {
    return getLocal(STORAGE_KEYS.STOCK_LEDGER, []);
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
    // ข้อมูลนิติบุคคลและเครดิต (B2B) เก็บสำรองในเครื่องด้วย เผื่อฐานข้อมูลยังไม่มีคอลัมน์
    const b2bFields = normalizeB2BFields(customerData);
    const metaEntry = { special_price_tier: specialTier, ...b2bFields };
    const payload = {
      ...basePayload,
      ...metaEntry,
    };

    const customerMeta = getLocal(STORAGE_KEYS.CUSTOMER_META, {});
    customerMeta[basePayload.code] = metaEntry;
    if (customerData.id) {
      customerMeta[customerData.id] = metaEntry;
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
            customerMeta[data.id] = metaEntry;
            setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);
            return { ...data, ...metaEntry };
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
            customerMeta[data.id] = metaEntry;
            setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);
            return { ...data, ...metaEntry };
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
      customerMeta[newCustomer.id] = metaEntry;
      setLocal(STORAGE_KEYS.CUSTOMER_META, customerMeta);
      const updated = [newCustomer, ...customers];
      setLocal(STORAGE_KEYS.CUSTOMERS, updated);
      return newCustomer;
    }
  },

  /**
   * บันทึกการรับชำระหนี้จากลูกค้าเครดิต (Payment Receipt)
   * รองรับทั้งชำระเต็มจำนวนและทยอยชำระ ยอดจะถูกนำไปหักยอดค้างแบบ FIFO
   */
  async recordCustomerPayment(paymentData, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const datePart = nowIso.slice(2, 10).replace(/-/g, '');
    const randomPart = Math.floor(100 + Math.random() * 900);
    const record = {
      receipt_number: `RCV-${datePart}-${randomPart}`,
      customer_id: paymentData.customer_id,
      customer_name: paymentData.customer_name || '',
      amount: Math.round((Number(paymentData.amount) || 0) * 100) / 100,
      method: paymentData.method || 'cash',
      note: String(paymentData.note || '').trim(),
      created_at: nowIso,
    };

    const { saved, updated } = await insertRemoteWithLocal(
      'customer_payments',
      STORAGE_KEYS.CUSTOMER_PAYMENTS,
      record,
      'rcv',
      isSupabaseActive
    );
    return { savedPayment: saved, updatedPayments: updated };
  },

  /**
   * เพิ่ม/แก้ไขผู้ใช้งาน (RBAC)
   * - เก็บ PIN เป็น SHA-256 พร้อม salt เท่านั้น (ไม่เก็บ PIN จริง)
   * - ส่ง pin ว่างตอนแก้ไข = ใช้ PIN เดิม
   */
  async upsertUser(userData, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const users = getLocal(STORAGE_KEYS.USERS, []);
    const existing = users.find((u) => u.id === userData.id) || null;
    const pin = String(userData.pin || '').trim();
    if (!existing && !/^\d{4,6}$/.test(pin)) {
      throw new Error('PIN ต้องเป็นตัวเลข 4-6 หลัก');
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      throw new Error('PIN ต้องเป็นตัวเลข 4-6 หลัก');
    }

    const salt = pin ? generateSalt() : existing.pin_salt;
    const record = {
      id: existing?.id || `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(userData.name || '').trim(),
      role: userData.role,
      is_active: userData.is_active !== false,
      pin_salt: salt,
      pin_hash: pin ? hashPin(pin, salt) : existing.pin_hash,
      created_at: existing?.created_at || nowIso,
      updated_at: nowIso,
    };
    if (!record.name) throw new Error('กรุณาระบุชื่อผู้ใช้งาน');

    // ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คนเสมอ
    const nextUsers = existing
      ? users.map((u) => (u.id === record.id ? record : u))
      : [record, ...users];
    if (!nextUsers.some((u) => u.role === 'admin' && u.is_active)) {
      throw new Error('ต้องมีผู้ดูแลระบบ (Admin) ที่เปิดใช้งานอย่างน้อย 1 คน');
    }

    if (isSupabaseActive && supabase) {
      try {
        await supabase.from('app_users').upsert([record]);
      } catch (err) {
        console.warn('Supabase app_users fallback:', err.message);
      }
    }
    setLocal(STORAGE_KEYS.USERS, nextUsers);
    return { savedUser: record, updatedUsers: nextUsers };
  },

  /**
   * ตรวจ PIN ของผู้ใช้ คืนค่า true ถ้าถูกต้องและบัญชียังเปิดใช้งาน
   */
  verifyUserPin(user, pin) {
    if (!user || !user.is_active) return false;
    return hashPin(String(pin || ''), user.pin_salt) === user.pin_hash;
  },

  /**
   * ออกใบกำกับภาษีเต็มรูปแบบ (Full Tax Invoice) จากบิลขาย 1 บิล
   * - เลขที่เรียงต่อเนื่องรายเดือน (TXYYYYMM-0001) ห้ามซ้ำ
   * - โหมด Supabase อ่านเลขล่าสุดจากฐานข้อมูลก่อน และลองเลขถัดไปถ้าชนกับเครื่องอื่น (unique)
   * - เก็บรายการสินค้าและยอด ณ วันที่ออก เพื่อให้พิมพ์ซ้ำได้ตรงเดิม
   */
  async createTaxInvoice(invoiceData, isSupabaseActive, existingInvoices = []) {
    const order = invoiceData.order;
    if (!order || order.status === 'voided') {
      throw new Error('ออกใบกำกับภาษีได้เฉพาะบิลที่ไม่ถูกยกเลิก');
    }
    if (
      existingInvoices.some((t) => t.order_number === order.order_number && t.status !== 'cancelled')
    ) {
      throw new Error(`บิล ${order.order_number} ออกใบกำกับภาษีเต็มรูปไปแล้ว`);
    }

    const now = new Date();
    const vat = calculateOrderVat(order);
    const baseRecord = {
      order_id: String(order.id || ''),
      order_number: order.order_number,
      buyer_name: String(invoiceData.buyer_name || '').trim(),
      buyer_tax_id: String(invoiceData.buyer_tax_id || '').replace(/\D/g, ''),
      buyer_branch: String(invoiceData.buyer_branch || '00000').padStart(5, '0').slice(-5),
      buyer_address: String(invoiceData.buyer_address || '').trim(),
      items: (order.items || []).map((i) => ({
        product_id: i.product_id || null,
        sku: i.sku || '',
        product_name: i.product_name,
        quantity: Number(i.quantity) || 0,
        unit: i.unit || '',
        unit_price: Number(i.unit_price) || 0,
        subtotal: Number(i.subtotal) || 0,
      })),
      bill_discount: Number(order.bill_discount) || 0,
      base_amount: vat.base,
      vat_amount: vat.vat,
      total_amount: vat.total,
      status: 'active',
      created_at: now.toISOString(),
    };

    const { saved, updated } = await insertWithRunningNumber({
      table: 'tax_invoices',
      storageKey: STORAGE_KEYS.TAX_INVOICES,
      numberField: 'invoice_number',
      code: 'TX',
      baseRecord,
      existingNumbers: existingInvoices.map((t) => t.invoice_number),
      isSupabaseActive,
      now,
    });
    return { savedInvoice: saved, updatedInvoices: updated };
  },

  /**
   * ออกใบลดหนี้ (Credit Note) หรือใบเพิ่มหนี้ (Debit Note) อ้างอิงใบกำกับภาษีเต็มรูป
   * - เลขที่ CNYYYYMM-0001 / DNYYYYMM-0001 เรียงต่อเนื่องรายเดือน
   * - ใบลดหนี้ที่ติ๊กคืนสินค้า จะบวกสต็อกกลับและบันทึก Stock Ledger ประเภท RETURN
   */
  async createTaxNote(noteData, isSupabaseActive, existingNotes = [], currentProducts = null) {
    const invoice = noteData.invoice;
    const isCredit = noteData.note_type === 'credit';
    if (!invoice) throw new Error('ไม่พบใบกำกับภาษีที่อ้างอิง');
    if (!String(noteData.reason || '').trim()) throw new Error('กรุณาระบุเหตุผลการออกเอกสาร');
    const amounts = noteData.amounts;
    if (!(amounts?.total > 0)) throw new Error('ยอดเงินต้องมากกว่า 0');

    const now = new Date();
    const baseRecord = {
      note_type: isCredit ? 'credit' : 'debit',
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.created_at,
      order_number: invoice.order_number,
      buyer_name: invoice.buyer_name,
      buyer_tax_id: invoice.buyer_tax_id || '',
      buyer_branch: invoice.buyer_branch || '00000',
      buyer_address: invoice.buyer_address || '',
      reason: String(noteData.reason).trim(),
      items: isCredit ? amounts.items || [] : [],
      original_total: Number(invoice.total_amount) || 0,
      base_amount: amounts.base,
      vat_amount: amounts.vat,
      total_amount: amounts.total,
      restocked: Boolean(isCredit && noteData.restock),
      status: 'active',
      created_at: now.toISOString(),
    };

    const { saved, updated } = await insertWithRunningNumber({
      table: 'tax_notes',
      storageKey: STORAGE_KEYS.TAX_NOTES,
      numberField: 'note_number',
      code: isCredit ? 'CN' : 'DN',
      baseRecord,
      existingNumbers: existingNotes.map((n) => n.note_number),
      isSupabaseActive,
      now,
    });

    // คืนสินค้าเข้าสต็อก (หน่วยของสินค้ารองแปลงกลับไปที่สินค้าหลัก)
    let updatedProducts = null;
    if (baseRecord.restocked) {
      const baseProducts =
        Array.isArray(currentProducts) && currentProducts.length > 0
          ? currentProducts
          : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
      const prodMap = new Map(baseProducts.map((p) => [p.id, p]));
      const restoreById = new Map();
      baseRecord.items.forEach((it) => {
        const prod = prodMap.get(it.product_id);
        if (!prod) return;
        const targetId = prod.linked_product_id || prod.id;
        const mult = prod.linked_product_id ? Math.max(1, Number(prod.linked_deduct_qty) || 1) : 1;
        restoreById.set(targetId, (restoreById.get(targetId) || 0) + (Number(it.quantity) || 0) * mult);
      });

      if (isSupabaseActive && supabase) {
        const remoteIds = [...restoreById.keys()].filter((id) => !String(id).startsWith('prod-'));
        if (remoteIds.length > 0) {
          try {
            const { data: rows } = await supabase.from('products').select('id, stock').in('id', remoteIds);
            for (const row of rows || []) {
              await supabase
                .from('products')
                .update({ stock: (Number(row.stock) || 0) + restoreById.get(row.id), updated_at: now.toISOString() })
                .eq('id', row.id);
            }
          } catch (err) {
            console.warn('Supabase credit note restock fallback:', err.message);
          }
        }
      }

      updatedProducts = normalizeAndSyncProducts(
        baseProducts.map((p) =>
          restoreById.has(p.id)
            ? { ...p, stock: (Number(p.stock) || 0) + restoreById.get(p.id), updated_at: now.toISOString() }
            : p
        )
      );
      setLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);
      await recordStockMovements(
        baseProducts,
        updatedProducts,
        { movement_type: 'RETURN', reference_doc: saved.note_number, reason: baseRecord.reason },
        isSupabaseActive
      );
    }

    return { savedNote: saved, updatedNotes: updated, updatedProducts };
  },

  /**
   * ออกใบวางบิล (Billing Note) รวมบิลเครดิตที่ค้างชำระของลูกค้า
   * บันทึกยอดคงค้างของแต่ละบิล ณ วันที่ออกใบวางบิล
   */
  async createBillingNote(noteData, isSupabaseActive) {
    const nowIso = new Date().toISOString();
    const datePart = nowIso.slice(2, 10).replace(/-/g, '');
    const randomPart = Math.floor(100 + Math.random() * 900);
    const bills = (noteData.bills || []).map((b) => ({
      order_id: b.order_id,
      order_number: b.order_number,
      order_date: b.order_date,
      due_date: b.due_date,
      amount: Math.round((Number(b.amount) || 0) * 100) / 100,
    }));
    const customer = noteData.customer || {};
    const record = {
      billing_number: `BN-${datePart}-${randomPart}`,
      customer_id: customer.id,
      customer_name: customer.name || '',
      customer_tax_id: customer.tax_id || '',
      customer_branch: customer.branch_number || '00000',
      customer_address: [customer.shop_name, customer.address].filter(Boolean).join(' '),
      order_ids: bills.map((b) => b.order_id),
      bills,
      total: Math.round(bills.reduce((sum, b) => sum + b.amount, 0) * 100) / 100,
      payment_due_date: noteData.payment_due_date,
      note: String(noteData.note || '').trim(),
      created_at: nowIso,
    };

    const { saved, updated } = await insertRemoteWithLocal(
      'billing_notes',
      STORAGE_KEYS.BILLING_NOTES,
      record,
      'bn',
      isSupabaseActive
    );
    return { savedNote: saved, updatedNotes: updated };
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
      credit_due_date: orderPayload.credit_due_date || null,
      created_by_name: orderPayload.created_by_name || '',
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
      const supabaseOrderData = {
        ...fullOrder,
        customer_id:
          fullOrder.customer_id && !String(fullOrder.customer_id).startsWith('cus-')
            ? fullOrder.customer_id
            : null,
      };
      const deductions = [...deductionByProductId.entries()].filter(
        ([targetId]) => !String(targetId).startsWith('prod-')
      );
      // ออฟไลน์หรือเน็ตหลุด: เก็บบิลเข้าคิวไว้ซิงค์ทีหลัง หน้าร้านขายต่อได้ทันที
      const result = isOnline()
        ? await pushOrderToSupabase(supabaseOrderData, deductions)
        : { ok: false, networkError: true };
      if (!result.ok && result.networkError) {
        enqueueOffline({ kind: 'order', order: supabaseOrderData, deductions });
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
    await recordStockMovements(
      products,
      syncedProducts,
      { movement_type: 'SALE', reference_doc: fullOrder.order_number },
      isSupabaseActive
    );

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

    // ยกเลิกบิลและคืนสต็อกใน Supabase
    // - อ้างอิงบิลด้วย order_number เพราะบิลที่เพิ่งขายในเครื่องนี้มี id ในเครื่อง (ord-...) ไม่ใช่ id ในฐานข้อมูล
    // - เปลี่ยนสถานะเฉพาะบิลที่ยัง completed เพื่อกันการคืนสต็อกซ้ำ ถ้าเครื่องอื่นยกเลิกไปแล้ว
    // - อ่านสต็อกล่าสุดจากฐานข้อมูลก่อนบวกคืน (ไม่ใช้ค่าที่แคชไว้ในเครื่อง)
    let alreadyVoidedRemotely = false;
    if (isSupabaseActive && supabase && order.order_number) {
      try {
        const { data: voidedRows, error: voidError } = await supabase
          .from('orders')
          .update({ status: 'voided' })
          .eq('order_number', order.order_number)
          .eq('status', 'completed')
          .select('id');
        // ไม่มีแถวถูกเปลี่ยน = บิลนี้ถูกยกเลิกจากเครื่องอื่นไปแล้ว (หรือไม่มีในฐานข้อมูล)
        alreadyVoidedRemotely = !voidError && Array.isArray(voidedRows) && voidedRows.length === 0;

        const remoteIds = [...restoreByProductId.keys()].filter(
          (id) => !String(id).startsWith('prod-')
        );
        if (!voidError && Array.isArray(voidedRows) && voidedRows.length > 0 && remoteIds.length > 0) {
          const { data: stockRows, error: stockError } = await supabase
            .from('products')
            .select('id, stock')
            .in('id', remoteIds);
          if (!stockError && Array.isArray(stockRows)) {
            for (const row of stockRows) {
              await supabase
                .from('products')
                .update({
                  stock: (Number(row.stock) || 0) + restoreByProductId.get(row.id),
                  updated_at: nowIso,
                })
                .eq('id', row.id);
            }
          }
        } else if (voidError) {
          console.warn('Supabase void order error:', voidError.message);
        }
      } catch (err) {
        console.warn('Supabase void order fallback:', err.message);
      }
    }

    const orders = getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    const updatedOrders = orders.map((o) =>
      o.id === order.id || (order.order_number && o.order_number === order.order_number)
        ? { ...o, status: 'voided' }
        : o
    );
    setLocal(STORAGE_KEYS.ORDERS, updatedOrders);

    // บิลถูกยกเลิกไปแล้วในฐานข้อมูล: ไม่คืนสต็อกและไม่บันทึก Ledger ซ้ำ
    if (alreadyVoidedRemotely) {
      return { updatedOrder: { ...order, status: 'voided' }, updatedProducts: products };
    }

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
    await recordStockMovements(
      products,
      syncedProducts,
      { movement_type: 'VOID', reference_doc: order.order_number },
      isSupabaseActive
    );

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
    const importNumber = generateImportNumber(nowIso);

    let syncedProducts = null;
    if (status === STOCK_IMPORT_STATUS.COMPLETED) {
      syncedProducts = await applyImportItemsToStock(
        items,
        currentProducts,
        isSupabaseActive,
        nowIso,
        importNumber
      );
    }

    const importRecord = {
      id: `imp-${Date.now()}`,
      import_number: importNumber,
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
        nowIso,
        target.import_number
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
        nowIso,
        target.import_number
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
    setLocal(STORAGE_KEYS.CUSTOMER_PAYMENTS, []);
    setLocal(STORAGE_KEYS.BILLING_NOTES, []);
    setLocal(STORAGE_KEYS.STOCK_LEDGER, []);
    setLocal(STORAGE_KEYS.TAX_INVOICES, []);
    setLocal(STORAGE_KEYS.TAX_NOTES, []);
    setLocal(STORAGE_KEYS.STOCK_COUNTS, []);
    setLocal(STORAGE_KEYS.PRODUCT_LOTS, []);
    setLocal(STORAGE_KEYS.WAREHOUSES, []);
    setLocal(STORAGE_KEYS.INVENTORY_BALANCES, []);
    setLocal(STORAGE_KEYS.STOCK_TRANSFERS, []);
    setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []);
    setLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    setLocal(STORAGE_KEYS.STOCK_IMPORTS, []);
    setLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    setLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    syncInitialWholesaleRulesWithProducts(resetProducts, []);
  },
};
