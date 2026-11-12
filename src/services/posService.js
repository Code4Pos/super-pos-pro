import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { B2B_CUSTOMER_DEFAULTS, normalizeB2BFields } from '../utils/credit';
import { calculateOrderVat, getNextTaxInvoiceNumber, getTaxInvoicePrefix } from '../utils/tax';
import { hashPin, generateSalt } from '../utils/rbac';
import { consumeLots, addToLots, restoreToLots, summarizeLotsByProduct } from '../utils/lots';
import { normalizeWarehouses, applyBalanceDelta, TRANSIT_WAREHOUSE_ID, SALES_WAREHOUSE_ID } from '../utils/warehouses';
import { generateDeviceCode, generateUuid, isUuid, nextOrderNumber, sanitizeDeviceCode } from '../utils/device';
import { printerService } from './printerService';
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
  SALES_ORDERS: 'siampos_sales_orders_v1',
  PRODUCT_LOTS: 'siampos_product_lots_v1',
  OFFLINE_QUEUE: 'siampos_offline_queue_v1',
  OFFLINE_FAILED: 'siampos_offline_failed_v1',
  SUPABASE_CACHE_AT: 'siampos_supabase_cache_at_v1',
  LOT_CONSUMPTIONS: 'siampos_lot_consumptions_v1',
  PENDING_POS_ACTION: 'siampos_pending_pos_action_v1',
  SUPPLIERS: 'siampos_suppliers_v1',
  STOCK_IMPORTS: 'siampos_stock_imports_v1',
  ORDERS: 'siampos_orders_v1',
  WHOLESALE_RULES: 'siampos_wholesale_rules_v1',
  SPECIAL_RULES: 'siampos_special_rules_v1',
  SHOP_SETTINGS: 'siampos_shop_settings_v1',
  DEVICE: 'siampos_device_v1',
  SERVER_CONFIG: 'siampos_server_config_v1',
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
      id: r.id,
      name: String(r.name || 'ราคาขายส่งหลายระดับ').trim(),
      type: isGroup ? 'group' : 'single',
      target_type: isGroup ? 'group' : 'single',
      product_id: pid,
      product_ids: pids,
      tiers,
      is_active: r.is_active !== false,
      created_at: r.created_at || nowIso,
      updated_at: r.updated_at || r.created_at || nowIso,
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
  const nowIso = new Date().toISOString();
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
      id: r.id,
      name: String(r.name || 'ราคาพิเศษ').trim(),
      type: isGroup ? 'group' : 'single',
      target_type: isGroup ? 'group' : 'single',
      product_id: pid,
      product_ids: pids,
      tiers,
      is_active: r.is_active !== false,
      created_at: r.created_at || nowIso,
      updated_at: r.updated_at || r.created_at || nowIso,
    };
  });
}

function normalizeLotConsumptions(list = []) {
  const nowIso = new Date().toISOString();
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && c.reference_doc && c.product_id)
    .map((c) => {
      const ts = c.updated_at || c.created_at || c.at || nowIso;
      return {
        id: c.id || `${c.reference_doc}:${c.product_id}`,
        reference_doc: c.reference_doc,
        product_id: c.product_id,
        consumed: Array.isArray(c.consumed) ? c.consumed : [],
        created_at: c.created_at || c.at || ts,
        updated_at: c.updated_at || c.at || ts,
      };
    });
}

const DEFAULT_SHOP_NAME = 'สยามค้าปลีก-ส่ง (SiamPOS Pro)';

function shopSettingsToRow(settings = {}, nowIso = new Date().toISOString()) {
  return {
    id: 'default',
    shop_name: String(settings.shopName ?? DEFAULT_SHOP_NAME).trim() || DEFAULT_SHOP_NAME,
    shop_address: String(settings.shopAddress ?? '').trim(),
    shop_phone: String(settings.shopPhone ?? '').trim(),
    footer_text: String(settings.footerText ?? '').trim(),
    promptpay_id: String(settings.promptpayId ?? '').trim(),
    vat_registered: Boolean(settings.vatRegistered),
    shop_tax_id: String(settings.shopTaxId ?? '').replace(/\D/g, '').slice(0, 13),
    shop_branch: String(settings.shopBranch || '00000').padStart(5, '0').slice(-5),
    vat_mode: ['no_vat', 'vat_in', 'vat_out'].includes(settings.vatMode) ? settings.vatMode : 'no_vat',
    updated_at: settings.updated_at || nowIso,
  };
}

function rowToShopSettings(row) {
  if (!row) return null;
  return {
    shopName: row.shop_name ?? DEFAULT_SHOP_NAME,
    shopAddress: row.shop_address ?? '',
    shopPhone: row.shop_phone ?? '',
    footerText: row.footer_text ?? '',
    promptpayId: row.promptpay_id ?? '',
    vatRegistered: Boolean(row.vat_registered),
    shopTaxId: row.shop_tax_id ?? '',
    shopBranch: row.shop_branch ?? '00000',
    vatMode: ['no_vat', 'vat_in', 'vat_out'].includes(row.vat_mode) ? row.vat_mode : 'no_vat',
    updated_at: row.updated_at || null,
  };
}

/**
 * โหลดค่าตั้งร้านที่ใช้ร่วมกันจากตาราง shop_settings (แถว id = 'default')
 * ถ้ารายการบนฐานข้อมูลใหม่กว่าหรือยังไม่เคยตั้งในเครื่อง จะอัปเดตเฉพาะค่าตั้งร้านโดยไม่กระทบค่าตั้งเครื่องพิมพ์ของเครื่องนี้
 */
async function loadRemoteShopSettings() {
  const localShop = printerService.getLocalShopSettings();
  try {
    const { data, error } = await supabase
      .from('shop_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();
    if (error || !data) return localShop;
    const remoteShop = rowToShopSettings(data);
    if (
      !localShop?.updated_at ||
      new Date(remoteShop.updated_at || 0) >= new Date(localShop.updated_at || 0)
    ) {
      return printerService.applyRemoteShopSettings(remoteShop);
    }
    return localShop;
  } catch {
    return localShop;
  }
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
 * โหลดเอกสารจากตารางใน Supabase แล้วรวมกับรายการที่บันทึกไว้ในเครื่อง (ไม่ซ้ำ id)
 * ถ้ายังไม่ได้สร้างตาราง (ยังไม่รัน Migration) จะใช้ข้อมูลในเครื่องอย่างเดียว
 */
async function loadRemoteWithLocal(table, storageKey, limit = 1000, orderField = 'created_at') {
  const localRows = getLocal(storageKey, []);
  try {
    const res = await supabase
      .from(table)
      .select('*')
      .order(orderField, { ascending: false })
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
  const plan = planStockMovements(beforeProducts, afterProducts, meta);
  await commitStockMovements(plan, isSupabaseActive, { remote: true });
  return plan.entries;
}

// สินค้าที่มีในฐานข้อมูลจริง (สินค้าที่สร้างในเครื่องโหมดสาธิตขึ้นต้นด้วย prod-)
function isRemoteProductId(id) {
  return !String(id).startsWith('prod-');
}

/**
 * วางแผนการเคลื่อนไหวสต็อก (Ledger + ล็อต) โดยยังไม่บันทึกอะไร
 * ใช้กับบิลขาย/ยกเลิกบิล ที่ต้องส่งทุกอย่างขึ้นฐานข้อมูลในคำสั่งเดียว (RPC) ก่อนบันทึกในเครื่อง
 */
function planStockMovements(beforeProducts, afterProducts, meta = {}) {
  const entries = buildStockMovements(beforeProducts, afterProducts, meta);
  const lotPlan = entries.length > 0 ? planLotChanges(entries, afterProducts, meta) : null;
  return { entries, lotPlan };
}

/**
 * บันทึกแผนการเคลื่อนไหวสต็อกลงเครื่อง
 * remote: true = ส่ง Ledger/ล็อตขึ้น Supabase แยกตาราง (แบบเดิม), false = ส่งไปแล้วผ่าน RPC
 */
async function commitStockMovements(plan, isSupabaseActive, { remote = true } = {}) {
  const { entries, lotPlan } = plan;
  if (entries.length === 0) return;

  const ledger = getLocal(STORAGE_KEYS.STOCK_LEDGER, []);
  setLocal(STORAGE_KEYS.STOCK_LEDGER, [...entries, ...ledger].slice(0, MAX_LOCAL_LEDGER_ENTRIES));

  // ใช้ id เดียวกับในเครื่อง เพื่อรวมข้อมูลจากฐานข้อมูลกับในเครื่องโดยไม่ซ้ำกัน
  const remoteEntries = entries.filter((e) => isRemoteProductId(e.product_id));
  if (remote && isSupabaseActive && supabase && remoteEntries.length > 0) {
    await upsertOrQueue('stock_ledger', remoteEntries);
  }
  if (lotPlan) {
    setLocal(STORAGE_KEYS.PRODUCT_LOTS, lotPlan.lots);
    setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, lotPlan.consumptions);
    if (remote) {
      await upsertChangedLots(lotPlan.beforeLots, lotPlan.lots, isSupabaseActive);
      if (isSupabaseActive && supabase && Array.isArray(lotPlan.addedConsumptions) && lotPlan.addedConsumptions.length > 0) {
        const remoteConsumptions = lotPlan.addedConsumptions.filter((c) => isRemoteProductId(c.product_id));
        if (remoteConsumptions.length > 0) await upsertOrQueue('lot_consumptions', remoteConsumptions);
      }
    }
  }
}

/**
 * ผลต่างของล็อตที่เปลี่ยน [{ row, delta, reference_doc }] สำหรับส่งให้ RPC บวก/ลบยอดบนฐานข้อมูล (ไม่เขียนทับยอดของเครื่องอื่น)
 */
function buildLotDeltas(lotPlan, referenceDoc = '') {
  if (!lotPlan) return [];
  const beforeById = new Map(lotPlan.beforeLots.map((l) => [l.id, l]));
  const unchanged = new Set(lotPlan.beforeLots);
  const ref = referenceDoc || lotPlan.referenceDoc || '';
  return lotPlan.lots
    .filter((l) => !unchanged.has(l) && isRemoteProductId(l.product_id))
    .map((row) => ({
      row,
      delta:
        Math.round(((Number(row.remaining_qty) || 0) - (Number(beforeById.get(row.id)?.remaining_qty) || 0)) * 10000) /
        10000,
      reference_doc: ref,
    }));
}

/**
 * ปรับล็อตของสินค้าที่ติดตาม Lot ตามการเคลื่อนไหวสต็อก (ทุกจุดที่สต็อกเปลี่ยนผ่าน recordStockMovements)
 * - สต็อกลด: ตัดล็อตตาม FEFO/FIFO และจำประวัติการตัดตามเลขที่เอกสาร
 * - ยกเลิกบิล (VOID): คืนเข้าล็อตเดิมที่บิลนั้นตัดไป
 * - รับสินค้าเข้า (IMPORT): สร้างล็อตตามเลขล็อต/วันหมดอายุที่ระบุในใบนำเข้า
 * - อื่นๆ ที่สต็อกเพิ่ม: เข้า "ไม่ระบุล็อต"
 * คืนค่า { beforeLots, lots, consumptions, addedConsumptions, referenceDoc } หรือ null ถ้าไม่มีสินค้าที่ติดตามล็อต (ยังไม่บันทึก)
 */
function planLotChanges(entries, afterProducts, meta = {}) {
  const productMap = new Map(afterProducts.map((p) => [p.id, p]));
  const tracked = entries.filter((e) => productMap.get(e.product_id)?.track_lots);
  if (tracked.length === 0) return null;

  const nowIso = new Date().toISOString();
  const beforeLots = getLocal(STORAGE_KEYS.PRODUCT_LOTS, []);
  let lots = beforeLots;
  let consumptions = normalizeLotConsumptions(getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []));
  const addedConsumptions = [];

  tracked.forEach((entry) => {
    const product = productMap.get(entry.product_id);
    const strategy = product.lot_strategy || 'FEFO';
    const delta = Number(entry.change_qty) || 0;

    if (delta < 0) {
      const result = consumeLots(lots, product.id, -delta, strategy, nowIso);
      lots = result.lots;
      if (meta.reference_doc && result.consumed.length > 0) {
        const record = {
          id: `${meta.reference_doc}:${product.id}`,
          reference_doc: meta.reference_doc,
          product_id: product.id,
          consumed: result.consumed,
          created_at: nowIso,
          updated_at: nowIso,
        };
        addedConsumptions.push(record);
        consumptions = [
          record,
          ...consumptions.filter((c) => c.id !== record.id),
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

  return { beforeLots, lots, consumptions, addedConsumptions, referenceDoc: meta.reference_doc || '' };
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
 * ลบข้อมูลตาม id บน Supabase ถ้าเชื่อมต่อไม่ได้ให้เก็บเข้าคิว
 */
async function deleteOrQueue(table, rowId) {
  if (!isOnline()) {
    enqueueOffline({ kind: 'delete', table, rowId });
    return false;
  }
  try {
    const { error } = await supabase.from(table).delete().eq('id', rowId);
    if (!error) return true;
    if (isNetworkError(error)) enqueueOffline({ kind: 'delete', table, rowId });
    else console.warn(`Supabase delete ${table} error:`, error.message);
  } catch (err) {
    if (isNetworkError(err)) enqueueOffline({ kind: 'delete', table, rowId });
    else console.warn(`Supabase delete ${table} error:`, err.message);
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
          .update({ stock: (Number(row.stock) || 0) - deductById.get(row.id), updated_at: nowIso })
          .eq('id', row.id);
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, networkError: isNetworkError(err) };
  }
}

// =================================================================================
// beta 0.3.6: บิลขาย / ยกเลิกบิล ผ่าน RPC (transaction เดียวบนฐานข้อมูล)
// ถ้ายังไม่ได้รัน Migration beta 0.3.6 (ไม่มีฟังก์ชัน) จะใช้วิธีเดิมที่ส่งหลายคำสั่งแยกกัน
// =================================================================================

function isMissingRpcError(error) {
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    /could not find the function/i.test(String(error?.message || ''))
  );
}

// คืนค่า { ok, data, networkError, missing }
async function callRpc(name, params) {
  try {
    const { data, error } = await supabase.rpc(name, params);
    if (!error) return { ok: true, data };
    if (isNetworkError(error)) return { ok: false, networkError: true };
    if (isMissingRpcError(error)) return { ok: false, missing: true };
    console.warn(`Supabase ${name} error:`, error.message);
    return { ok: false, networkError: false, message: error.message };
  } catch (err) {
    return { ok: false, networkError: isNetworkError(err), message: err?.message };
  }
}

/**
 * ส่งบิลขาย: บันทึกบิล + ตัดสต็อกแบบลบจากยอดบนฐานข้อมูล + Ledger + ล็อต ในคำสั่งเดียว
 * ส่งซ้ำได้ (id เดิม = ไม่บันทึกซ้ำ) ใช้ทั้งตอนขายและตอนซิงค์คิวออฟไลน์
 * payload: { p_order, p_deductions: [{product_id, qty}], p_ledger, p_lots: [{row, delta}] }
 */
async function pushOrderRpc(payload) {
  const result = await callRpc('create_order', payload);
  if (!result.missing) return result;

  const legacy = await pushOrderToSupabase(
    payload.p_order,
    payload.p_deductions.map((d) => [d.product_id, d.qty])
  );
  if (legacy.ok) {
    if (payload.p_ledger.length > 0) await upsertOrQueue('stock_ledger', payload.p_ledger);
    if (payload.p_lots.length > 0) await upsertOrQueue('product_lots', payload.p_lots.map((l) => l.row));
  }
  return legacy;
}

/**
 * ยกเลิกบิล: เปลี่ยนสถานะเฉพาะบิลที่ยัง completed + คืนสต็อก + Ledger + ล็อต ในคำสั่งเดียว
 * data.status = 'voided' | 'already_voided' | 'not_found'
 * payload: { p_order_id, p_order_number, p_restores: [{product_id, qty}], p_ledger, p_lots: [{row, delta}] }
 */
async function pushVoidRpc(payload) {
  const result = await callRpc('void_order', payload);
  if (!result.missing) return result;

  // วิธีเดิม (ยังไม่ได้รัน Migration): หลายคำสั่งแยกกัน
  try {
    let query = supabase.from('orders').update({ status: 'voided' }).eq('status', 'completed');
    query = payload.p_order_id ? query.eq('id', payload.p_order_id) : query.eq('order_number', payload.p_order_number);
    const { data: voidedRows, error: voidError } = await query.select('id');
    if (voidError) {
      return isNetworkError(voidError)
        ? { ok: false, networkError: true }
        : { ok: false, networkError: false, message: voidError.message };
    }
    if (!Array.isArray(voidedRows) || voidedRows.length === 0) {
      return { ok: true, data: { status: 'already_voided' } };
    }
    const restoreById = new Map(payload.p_restores.map((r) => [r.product_id, r.qty]));
    if (restoreById.size > 0) {
      const { data: stockRows } = await supabase.from('products').select('id, stock').in('id', [...restoreById.keys()]);
      const nowIso = new Date().toISOString();
      for (const row of stockRows || []) {
        await supabase
          .from('products')
          .update({ stock: (Number(row.stock) || 0) + restoreById.get(row.id), updated_at: nowIso })
          .eq('id', row.id);
      }
    }
    if (payload.p_ledger.length > 0) await upsertOrQueue('stock_ledger', payload.p_ledger);
    if (payload.p_lots.length > 0) await upsertOrQueue('product_lots', payload.p_lots.map((l) => l.row));
    return { ok: true, data: { status: 'voided' } };
  } catch (err) {
    return { ok: false, networkError: isNetworkError(err), message: err?.message };
  }
}

// เก็บรายการที่ส่งไม่สำเร็จเพราะข้อมูลผิด (ไม่ใช่เน็ต) ไว้ตรวจสอบภายหลัง ไม่ให้บิลหายเงียบ
function recordFailedSync(item, message) {
  const failedItems = getLocal(STORAGE_KEYS.OFFLINE_FAILED, []);
  setLocal(STORAGE_KEYS.OFFLINE_FAILED, [
    ...failedItems,
    { ...item, error: message || '', failed_at: new Date().toISOString() },
  ]);
}

// ปรับสต็อกในเครื่องให้ตรงกับยอดล่าสุดที่ฐานข้อมูลคืนมา ({ [productId]: stock })
function applyRemoteBalances(products, balances) {
  if (!balances || typeof balances !== 'object' || Object.keys(balances).length === 0) return products;
  return normalizeAndSyncProducts(
    products.map((p) =>
      Object.prototype.hasOwnProperty.call(balances, p.id) ? { ...p, stock: Number(balances[p.id]) || 0 } : p
    )
  );
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
  const nowIso = new Date().toISOString();
  return (Array.isArray(list) ? list : []).map((imp) => {
    const status = imp.status || STOCK_IMPORT_STATUS.COMPLETED;
    const createdAt = imp.created_at || nowIso;
    const items = Array.isArray(imp.items) ? imp.items : [];
    const totals = calculateImportTotals(items);
    return {
      id: imp.id || `imp-${Date.now()}`,
      import_number: imp.import_number || generateImportNumber(createdAt),
      supplier_id: imp.supplier_id || null,
      supplier_name: imp.supplier_name || '-',
      supplier_phone: imp.supplier_phone || '',
      warehouse_id: imp.warehouse_id || SALES_WAREHOUSE_ID,
      items,
      total_items: Number(imp.total_items ?? totals.total_items) || 0,
      total_discount: Number(imp.total_discount ?? totals.total_discount) || 0,
      grand_total: Number(imp.grand_total ?? totals.grand_total) || 0,
      note: imp.note || '',
      status,
      status_history: Array.isArray(imp.status_history)
        ? imp.status_history
        : [{ status, at: createdAt }],
      created_at: createdAt,
      updated_at: imp.updated_at || createdAt,
    };
  });
}

function sanitizeSupplierRow(s = {}, nowIso = new Date().toISOString()) {
  const createdAt = s.created_at || nowIso;
  return {
    id: s.id || `sup-${Date.now()}`,
    name: String(s.name || '').trim(),
    address: String(s.address || '').trim(),
    tambon: String(s.tambon || '').trim(),
    amphoe: String(s.amphoe || '').trim(),
    province: String(s.province || '').trim(),
    zipcode: String(s.zipcode || '').trim(),
    phone: String(s.phone || '').trim(),
    created_at: createdAt,
    updated_at: s.updated_at || createdAt,
  };
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
 * เพิ่มยอดแยกคลังของสินค้าหลายรายการ (Map productId -> จำนวนหน่วยฐาน) เข้าคลังที่ระบุ
 */
async function addToWarehouseBalances(qtyByProductId, warehouseId, isSupabaseActive, nowIso = new Date().toISOString()) {
  if (!warehouseId || warehouseId === SALES_WAREHOUSE_ID || qtyByProductId.size === 0) return;
  const before = getLocal(STORAGE_KEYS.INVENTORY_BALANCES, []);
  let balances = before;
  for (const [pid, qty] of qtyByProductId.entries()) {
    balances = applyBalanceDelta(balances, warehouseId, pid, qty, nowIso);
  }
  setLocal(STORAGE_KEYS.INVENTORY_BALANCES, balances);
  if (isSupabaseActive && supabase) {
    const unchanged = new Set(before);
    const changed = balances.filter((b) => !unchanged.has(b));
    if (changed.length > 0) await upsertOrQueue('inventory_balances', changed);
  }
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
  referenceDoc = '',
  warehouseId = SALES_WAREHOUSE_ID
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
  // รับเข้าคลังที่เลือก (คลังหน้าร้านไม่ต้องบันทึก เพราะคำนวณจากสต็อกรวม)
  await addToWarehouseBalances(addStockByProductId, warehouseId, isSupabaseActive, nowIso);
  return syncedProducts;
}

export const posService = {
  /**
   * โหลดเฉพาะข้อมูลที่จำเป็นสำหรับ "หน้าขายหน้าร้าน (POS)"
   * ไม่โหลดข้อมูลหลังร้านที่ไม่จำเป็น (เช่น ใบวางบิล, ประวัติความเคลื่อนไหวสต็อก, ใบกำกับภาษี, ใบลดหนี้, ใบตรวจนับ, คลัง/ใบโอน, ผู้ผลิต, ใบนำเข้า, ถังขยะ)
   * เพื่อให้เปิดหน้าขายได้รวดเร็วและใช้หน่วยความจำน้อยที่สุดบนเครื่อง POS (เช่น Sunmi T2)
   */
  async fetchPOSData() {
    const localTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    const localCustomerMeta = getLocal(STORAGE_KEYS.CUSTOMER_META, {});
    const rawWholesaleRules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const rawSpecialRules = getLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    const specialRules = normalizeSpecialRules(rawSpecialRules);

    let offlineFallback = false;
    if (isSupabaseConfigured && supabase) {
      try {
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
          .filter((p) => !p.is_trashed && !trashIds.has(p.id))
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

        const mergedCustomers = (cusRes.data || []).map((c) =>
          mergeCustomerMeta(c, localCustomerMeta)
        );

        // โหลดเฉพาะตารางย่อยที่ต้องใช้ในหน้าขาย:
        // - customer_payments: คำนวณวงเงินเครดิตคงเหลือเมื่อขายเชื่อ
        // - app_users: ล็อกอิน PIN และตรวจสิทธิ์
        // - product_lots / lot_consumptions: ตัดล็อต FEFO/FIFO ตอนขาย และคืนล็อตตอนยกเลิกบิลข้ามเครื่อง
        // - sales_orders: คำนวณยอดจอง ATP และปิดใบจองเมื่อเปิดบิลขาย
        // - wholesale_rules / special_rules / shop_settings: กฎราคาขายส่ง ราคาพิเศษ และตั้งค่าร้าน/VAT
        const [
          customerPayments,
          remoteUsers,
          remoteLots,
          remoteSalesOrders,
          remoteWholesaleRules,
          remoteSpecialRules,
          remoteLotConsumptions,
        ] = await Promise.all([
          loadRemoteWithLocal('customer_payments', STORAGE_KEYS.CUSTOMER_PAYMENTS),
          loadRemoteWithLocal('app_users', STORAGE_KEYS.USERS),
          loadRemoteWithLocal('product_lots', STORAGE_KEYS.PRODUCT_LOTS, 5000),
          loadRemoteWithLocal('sales_orders', STORAGE_KEYS.SALES_ORDERS, 1000),
          loadRemoteWithLocal('wholesale_rules', STORAGE_KEYS.WHOLESALE_RULES, 1000),
          loadRemoteWithLocal('special_rules', STORAGE_KEYS.SPECIAL_RULES, 1000),
          loadRemoteWithLocal('lot_consumptions', STORAGE_KEYS.LOT_CONSUMPTIONS, 5000),
          loadRemoteShopSettings(),
        ]);

        const mergedWholesaleRaw = mergeByLatestUpdate(
          remoteWholesaleRules,
          getLocal(STORAGE_KEYS.WHOLESALE_RULES, [])
        );
        const wholesaleRules = syncInitialWholesaleRulesWithProducts(
          syncedSupaProducts,
          mergedWholesaleRaw
        );
        const syncedSpecialRules = normalizeSpecialRules(
          mergeByLatestUpdate(
            remoteSpecialRules,
            getLocal(STORAGE_KEYS.SPECIAL_RULES, [])
          )
        );
        setLocal(STORAGE_KEYS.SPECIAL_RULES, syncedSpecialRules);

        const lotConsumptions = normalizeLotConsumptions(
          mergeByLatestUpdate(
            remoteLotConsumptions,
            normalizeLotConsumptions(getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []))
          )
        );
        setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, lotConsumptions);

        const salesOrders = mergeByLatestUpdate(remoteSalesOrders, getLocal(STORAGE_KEYS.SALES_ORDERS, []));
        setLocal(STORAGE_KEYS.SALES_ORDERS, salesOrders);
        const productLots = mergeByLatestUpdate(remoteLots, getLocal(STORAGE_KEYS.PRODUCT_LOTS, []));
        setLocal(STORAGE_KEYS.PRODUCT_LOTS, productLots);
        const users = mergeByLatestUpdate(remoteUsers, getLocal(STORAGE_KEYS.USERS, []));
        setLocal(STORAGE_KEYS.USERS, users);

        if (categories.length > 1) setLocal(STORAGE_KEYS.CATEGORIES, categories);
        setLocal(STORAGE_KEYS.CUSTOMERS, cusRes.data || []);
        setLocal(STORAGE_KEYS.ORDERS, ordRes.data || []);
        setLocal(STORAGE_KEYS.SUPABASE_CACHE_AT, new Date().toISOString());

        return {
          mode: 'supabase',
          categories: categories.length > 1 ? categories : INITIAL_CATEGORIES,
          units: [],
          products: syncedSupaProducts,
          trashedProducts: [],
          customers: mergedCustomers,
          customerPayments,
          billingNotes: [],
          stockLedger: [],
          taxInvoices: [],
          taxNotes: [],
          stockCounts: [],
          warehouses: [],
          inventoryBalances: [],
          stockTransfers: [],
          salesOrders,
          productLots,
          users,
          suppliers: [],
          stockImports: [],
          orders: ordRes.data || [],
          wholesaleRules,
          specialRules: syncedSpecialRules,
        };
      } catch (err) {
        offlineFallback = isNetworkError(err) && Boolean(getLocal(STORAGE_KEYS.SUPABASE_CACHE_AT, null));
        console.warn(
          offlineFallback
            ? 'Supabase offline, using cached POS data:'
            : 'Supabase connection error, falling back to Demo Mode:',
          err.message
        );
      }
    }

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
      units: [],
      products: normalized,
      trashedProducts: [],
      customers: localCustomers,
      customerPayments: getLocal(STORAGE_KEYS.CUSTOMER_PAYMENTS, []),
      billingNotes: [],
      stockLedger: [],
      taxInvoices: [],
      taxNotes: [],
      stockCounts: [],
      warehouses: [],
      inventoryBalances: [],
      stockTransfers: [],
      salesOrders: getLocal(STORAGE_KEYS.SALES_ORDERS, []),
      productLots: getLocal(STORAGE_KEYS.PRODUCT_LOTS, []),
      users: getLocal(STORAGE_KEYS.USERS, []),
      suppliers: [],
      stockImports: [],
      orders: getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS),
      wholesaleRules,
      specialRules,
    };
  },

  /**
   * โหลดข้อมูลทั้งหมดของระบบ (สำหรับหน้าจัดการหลังร้าน Admin)
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

        const mapSupaProduct = (p) => {
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
        };

        const remoteActiveById = new Map(
          (prodRes.data || []).filter((p) => !p.is_trashed).map((p) => [p.id, p])
        );
        const activeLocalTrash = localTrash.filter((t) => {
          const remoteActive = remoteActiveById.get(t.id);
          if (!remoteActive) return true;
          const trashTime = t.deleted_at || t.updated_at || '';
          const remoteTime = remoteActive.updated_at || '';
          return trashTime > remoteTime;
        });
        const remoteTrashed = (prodRes.data || [])
          .filter((p) => p.is_trashed)
          .map(mapSupaProduct);
        const mergedTrash = mergeByLatestUpdate(remoteTrashed, activeLocalTrash);
        setLocal(STORAGE_KEYS.TRASH_PRODUCTS, mergedTrash);

        const trashIds = new Set(mergedTrash.map((t) => t.id));
        const supaList = (prodRes.data || [])
          .filter((p) => !p.is_trashed && !trashIds.has(p.id))
          .map(mapSupaProduct);

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
        const [remoteWarehouses, remoteBalances, remoteTransfers, remoteSalesOrders] = await Promise.all([
          loadRemoteWithLocal('warehouses', STORAGE_KEYS.WAREHOUSES, 200),
          loadRemoteWithLocal('inventory_balances', STORAGE_KEYS.INVENTORY_BALANCES, 10000),
          loadRemoteWithLocal('stock_transfers', STORAGE_KEYS.STOCK_TRANSFERS, 500),
          loadRemoteWithLocal('sales_orders', STORAGE_KEYS.SALES_ORDERS, 1000),
        ]);
        // beta 0.3.7: ผู้ผลิต ใบนำเข้า กฎราคาขายส่ง/ราคาพิเศษ ประวัติตัดล็อต หน่วยนับ และตั้งค่าร้านค้า
        const [
          remoteSuppliers,
          remoteStockImports,
          remoteWholesaleRules,
          remoteSpecialRules,
          remoteLotConsumptions,
          remoteUnits,
        ] = await Promise.all([
          loadRemoteWithLocal('suppliers', STORAGE_KEYS.SUPPLIERS, 1000),
          loadRemoteWithLocal('stock_imports', STORAGE_KEYS.STOCK_IMPORTS, 2000),
          loadRemoteWithLocal('wholesale_rules', STORAGE_KEYS.WHOLESALE_RULES, 1000),
          loadRemoteWithLocal('special_rules', STORAGE_KEYS.SPECIAL_RULES, 1000),
          loadRemoteWithLocal('lot_consumptions', STORAGE_KEYS.LOT_CONSUMPTIONS, 5000),
          loadRemoteWithLocal('units', STORAGE_KEYS.UNITS, 500, 'name'),
          loadRemoteShopSettings(),
        ]);

        const syncedSuppliers = mergeByLatestUpdate(
          remoteSuppliers,
          getLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS)
        ).map((s) => sanitizeSupplierRow(s));
        setLocal(STORAGE_KEYS.SUPPLIERS, syncedSuppliers);

        const syncedStockImports = normalizeStockImports(
          mergeByLatestUpdate(
            remoteStockImports,
            getLocal(STORAGE_KEYS.STOCK_IMPORTS, [])
          )
        );
        setLocal(STORAGE_KEYS.STOCK_IMPORTS, syncedStockImports);

        const mergedWholesaleRaw = mergeByLatestUpdate(
          remoteWholesaleRules,
          getLocal(STORAGE_KEYS.WHOLESALE_RULES, [])
        );
        const wholesaleRules = syncInitialWholesaleRulesWithProducts(
          syncedSupaProducts,
          mergedWholesaleRaw
        );

        const syncedSpecialRules = normalizeSpecialRules(
          mergeByLatestUpdate(
            remoteSpecialRules,
            getLocal(STORAGE_KEYS.SPECIAL_RULES, [])
          )
        );
        setLocal(STORAGE_KEYS.SPECIAL_RULES, syncedSpecialRules);

        const lotConsumptions = normalizeLotConsumptions(
          mergeByLatestUpdate(
            remoteLotConsumptions,
            normalizeLotConsumptions(getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []))
          )
        );
        setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, lotConsumptions);

        const syncedUnits = mergeByLatestUpdate(remoteUnits, localUnits);
        if (syncedUnits.length > 0) setLocal(STORAGE_KEYS.UNITS, syncedUnits);

        const salesOrders = mergeByLatestUpdate(remoteSalesOrders, getLocal(STORAGE_KEYS.SALES_ORDERS, []));
        setLocal(STORAGE_KEYS.SALES_ORDERS, salesOrders);
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
          units: syncedUnits.length > 0 ? syncedUnits : localUnits,
          products: syncedSupaProducts,
          trashedProducts: mergedTrash,
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
          salesOrders,
          productLots,
          users,
          suppliers: syncedSuppliers,
          stockImports: syncedStockImports,
          orders: ordRes.data || [],
          wholesaleRules,
          specialRules: syncedSpecialRules,
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
      salesOrders: getLocal(STORAGE_KEYS.SALES_ORDERS, []),
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
    const baseProducts =
      Array.isArray(currentProducts) && currentProducts.length > 0
        ? currentProducts
        : getLocal(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const existingProd = productData.id
      ? baseProducts.find((p) => p.id === productData.id)
      : null;

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
      lead_time_days:
        productData.lead_time_days !== undefined
          ? productData.lead_time_days
          : existingProd?.lead_time_days ?? null,
      safety_stock:
        productData.safety_stock !== undefined
          ? productData.safety_stock
          : existingProd?.safety_stock ?? null,
      track_lots:
        productData.track_lots !== undefined
          ? Boolean(productData.track_lots)
          : Boolean(existingProd?.track_lots),
      lot_strategy:
        productData.lot_strategy || existingProd?.lot_strategy || 'FEFO',
      updated_at: nowIso,
      is_active: productData.is_active !== false,
    };

    const supaPayload = {
      ...cleanPayload,
      linked_product_id: isUuid(linkedProductId) ? linkedProductId : null,
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
            .update(supaPayload)
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
            .insert([supaPayload])
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

    let wsRuleToSync = null;
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
          created_at: existingRule.created_at || nowIso,
          updated_at: nowIso,
        };
        const nextWsRules = currentWsRules.map((r, idx) =>
          idx === existingSingleRuleIndex ? updatedRule : r
        );
        setLocal(STORAGE_KEYS.WHOLESALE_RULES, nextWsRules);
        wsRuleToSync = updatedRule;
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
        wsRuleToSync = newRule;
      }
    } else if (existingSingleRuleIndex > -1) {
      const deactivatedRule = {
        ...currentWsRules[existingSingleRuleIndex],
        is_active: false,
        created_at: currentWsRules[existingSingleRuleIndex].created_at || nowIso,
        updated_at: nowIso,
      };
      const nextWsRules = currentWsRules.map((r, idx) =>
        idx === existingSingleRuleIndex ? deactivatedRule : r
      );
      setLocal(STORAGE_KEYS.WHOLESALE_RULES, nextWsRules);
      wsRuleToSync = deactivatedRule;
    }

    if (isSupabaseActive && supabase && wsRuleToSync) {
      await upsertOrQueue('wholesale_rules', [wsRuleToSync]);
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

    if (isSupabaseActive && supabase && !String(productId).startsWith('prod-')) {
      try {
        await supabase
          .from('products')
          .update({
            is_trashed: true,
            deleted_at: nowIso,
            linked_product_id: null,
            linked_deduct_qty: 1,
            updated_at: nowIso,
          })
          .eq('id', productId);
        if (isUuid(productId)) {
          await supabase
            .from('products')
            .update({ linked_product_id: null, linked_deduct_qty: 1, updated_at: nowIso })
            .eq('linked_product_id', productId);
        }
      } catch {
        // fallback local
      }
    }

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
        is_trashed: true,
        linked_product_id: null,
        linked_deduct_qty: 1,
        deleted_at: nowIso,
        updated_at: nowIso,
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
  async restoreProductFromTrash(productId, isSupabaseActive = false) {
    const nowIso = new Date().toISOString();
    const currentTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    const target = currentTrash.find((t) => t.id === productId);
    if (!target) return null;

    if (isSupabaseActive && supabase && !String(productId).startsWith('prod-')) {
      try {
        await supabase
          .from('products')
          .update({
            is_trashed: false,
            deleted_at: null,
            updated_at: nowIso,
          })
          .eq('id', productId);
      } catch {
        // fallback local
      }
    }

    const updatedTrash = currentTrash.filter((t) => t.id !== productId);
    setLocal(STORAGE_KEYS.TRASH_PRODUCTS, updatedTrash);

    const restoredProduct = {
      ...target,
      is_trashed: false,
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
   * บันทึกใบสั่งขายส่ง/ใบจองสินค้า (id ฝั่งแอป ใช้ upsert)
   * เปลี่ยนสถานะได้เฉพาะจาก 'reserved' เท่านั้น (กันเปิดบิลซ้ำ/ยกเลิกซ้ำจากหลายหน้าจอ)
   */
  async saveSalesOrder(record, isSupabaseActive) {
    const orders = getLocal(STORAGE_KEYS.SALES_ORDERS, []);
    const previous = orders.find((o) => o.id === record.id) || null;
    if (previous && previous.status !== 'reserved') throw new Error('ใบสั่งขายนี้ปิดไปแล้ว');
    const saved = { ...record, updated_at: new Date().toISOString() };
    const updated = previous ? orders.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...orders];
    setLocal(STORAGE_KEYS.SALES_ORDERS, updated);
    if (isSupabaseActive && supabase) await upsertOrQueue('sales_orders', [saved]);
    return { saved, salesOrders: updated };
  },

  getInventoryBalances() {
    return getLocal(STORAGE_KEYS.INVENTORY_BALANCES, []);
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
   * ค่าตั้งของเครื่องนี้ (เก็บเฉพาะในเครื่อง ไม่ซิงค์):
   * - code: รหัสเครื่องที่ใช้ขึ้นต้นเลขที่บิล (ถ้ายังไม่เคยตั้ง จะสุ่มรหัสให้ เช่น POS-K7Q)
   * - defaultMode: โหมดเริ่มต้นเมื่อเปิดแอปในเครื่องนี้ ('ask' = ถามทุกครั้ง, 'pos' = หน้าร้านทันที, 'admin' = หลังร้านทันที)
   */
  getDeviceSettings() {
    const device = getLocal(STORAGE_KEYS.DEVICE, {});
    const defaultMode = ['pos', 'admin'].includes(device.defaultMode)
      ? device.defaultMode
      : 'ask';
    const cleanCode = sanitizeDeviceCode(device.code);
    if (cleanCode) {
      return { ...device, code: cleanCode, defaultMode };
    }
    const created = { ...device, code: generateDeviceCode(), defaultMode };
    setLocal(STORAGE_KEYS.DEVICE, created);
    return created;
  },

  saveDeviceSettings(patch = {}) {
    const device = this.getDeviceSettings();
    const nextDefaultMode =
      patch.defaultMode !== undefined
        ? ['pos', 'admin'].includes(patch.defaultMode)
          ? patch.defaultMode
          : 'ask'
        : device.defaultMode;
    let nextCode = device.code;
    if (patch.code !== undefined) {
      const clean = sanitizeDeviceCode(patch.code);
      if (!clean) throw new Error('กรุณาระบุรหัสเครื่อง (A-Z, 0-9 หรือ -)');
      nextCode = clean;
    }
    // เปลี่ยนรหัสเครื่อง = เริ่มเลขรันใหม่ของรหัสนั้น (เลขรันคำนวณจากบิลที่มีในเครื่องด้วย จึงไม่ซ้ำ)
    const base = nextCode === device.code ? device : { code: nextCode };
    const saved = { ...base, code: nextCode, defaultMode: nextDefaultMode };
    setLocal(STORAGE_KEYS.DEVICE, saved);
    return saved;
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
      if (item.kind === 'order_rpc') {
        result = await pushOrderRpc(item.payload);
      } else if (item.kind === 'void_rpc') {
        result = await pushVoidRpc(item.payload);
      } else if (item.kind === 'order') {
        // รายการที่เข้าคิวจากเวอร์ชันก่อน beta 0.3.6
        result = await pushOrderToSupabase(item.order, item.deductions || []);
      } else if (item.kind === 'delete') {
        try {
          const { error } = await supabase.from(item.table).delete().eq('id', item.rowId);
          result = {
            ok: !error,
            networkError: error ? isNetworkError(error) : false,
            message: error?.message,
          };
        } catch (err) {
          result = { ok: false, networkError: isNetworkError(err), message: err?.message };
        }
      } else {
        try {
          const { error } = await supabase.from(item.table).upsert(item.rows);
          result = {
            ok: !error,
            networkError: error ? isNetworkError(error) : false,
            message: error?.message,
          };
        } catch (err) {
          result = { ok: false, networkError: isNetworkError(err), message: err?.message };
        }
      }
      if (result.networkError) break;
      if (result.ok) synced += 1;
      else {
        failed += 1;
        recordFailedSync(item, result.message);
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
  async addUnit(unitData, isSupabaseActive = false) {
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
    if (isSupabaseActive && supabase) await upsertOrQueue('units', [newUnit]);
    return newUnit;
  },

  /**
   * แก้ไขหน่วยนับสินค้า
   */
  async updateUnit(unitId, unitData, isSupabaseActive = false) {
    const cleanName = String(unitData.name || '').trim();
    const units = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const oldUnit = units.find((u) => u.id === unitId);
    const updatedUnits = units.map((u) =>
      u.id === unitId ? { ...u, name: cleanName } : u
    );
    setLocal(STORAGE_KEYS.UNITS, updatedUnits);
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('units', [{ id: unitId, name: cleanName }]);
    }

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
  async deleteUnit(unitId, isSupabaseActive = false) {
    const units = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS);
    const updated = units.filter((u) => u.id !== unitId);
    setLocal(STORAGE_KEYS.UNITS, updated);
    if (isSupabaseActive && supabase) await deleteOrQueue('units', unitId);
    return true;
  },

  /**
   * เพิ่มหรือแก้ไขข้อมูลลูกค้า (ปลีก / ยี่ปั๊วขายส่ง + สิทธิระดับราคาพิเศษ ขั้นที่ 0-10)
   */
  async upsertCustomer(customerData, isSupabaseActive) {
    const nowIso = new Date().toISOString();
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
      updated_at: nowIso,
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
    const orders = getLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    // เลขที่บิลแบบ <รหัสเครื่อง>-YYMMDD-<เลขรัน> และ id ฝั่งแอป (ใช้ id เดียวกันทั้งในเครื่องและฐานข้อมูล)
    const { orderNumber, device } = nextOrderNumber(getLocal(STORAGE_KEYS.DEVICE, {}), orders);
    setLocal(STORAGE_KEYS.DEVICE, device);
    const orderId = generateUuid();

    const fullOrder = {
      id: orderId,
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

    // ตัดสต็อกจากสินค้าหลักและซิงค์สต็อกสินค้ารองทั้งหมด
    // ยอมให้สต็อกติดลบ (ขายเกินสต็อก) เพื่อให้ Ledger ตรงกับสต็อกเสมอ แล้วค่อยปรับยอดภายหลัง
    const updatedProducts = products.map((prod) => {
      const deduct = deductionByProductId.get(prod.id);
      if (!deduct) return prod;
      return {
        ...prod,
        stock: (Number(prod.stock) || 0) - deduct,
        updated_at: nowIso,
      };
    });
    let syncedProducts = normalizeAndSyncProducts(updatedProducts);
    const stockPlan = planStockMovements(products, syncedProducts, {
      movement_type: 'SALE',
      reference_doc: fullOrder.order_number,
    });

    if (isSupabaseActive && supabase) {
      const payload = {
        p_order: {
          ...fullOrder,
          customer_id: isUuid(fullOrder.customer_id) ? fullOrder.customer_id : null,
        },
        p_deductions: [...deductionByProductId.entries()]
          .filter(([targetId]) => isRemoteProductId(targetId))
          .map(([product_id, qty]) => ({ product_id, qty })),
        p_ledger: stockPlan.entries.filter((e) => isRemoteProductId(e.product_id)),
        p_lots: buildLotDeltas(stockPlan.lotPlan, fullOrder.order_number),
      };
      // ออฟไลน์หรือเน็ตหลุด: เก็บบิลเข้าคิวไว้ซิงค์ทีหลัง หน้าร้านขายต่อได้ทันที
      const result = isOnline() ? await pushOrderRpc(payload) : { ok: false, networkError: true };
      if (result.networkError) {
        enqueueOffline({ kind: 'order_rpc', payload });
      } else if (!result.ok) {
        recordFailedSync({ kind: 'order_rpc', payload }, result.message);
      } else if (result.data) {
        // เลขที่บิลชนกับบิลเดิมในฐานข้อมูล ฐานข้อมูลจะต่อท้ายเลขให้ไม่ซ้ำ
        if (result.data.order_number) fullOrder.order_number = result.data.order_number;
        syncedProducts = applyRemoteBalances(syncedProducts, result.data.balances);
      }
    }

    // บันทึกใน LocalStorage
    const localOrder = { ...fullOrder };
    setLocal(STORAGE_KEYS.ORDERS, [localOrder, ...orders]);
    setLocal(STORAGE_KEYS.PRODUCTS, syncedProducts);
    // บิลส่งขึ้นฐานข้อมูลพร้อม Ledger/ล็อตแล้ว (หรือเข้าคิว) จึงบันทึกเฉพาะในเครื่อง
    await commitStockMovements(stockPlan, isSupabaseActive, { remote: false });

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

    // กรณียกเลิกบิลจากคนละเครื่อง: โหลดประวัติการตัดล็อตของบิลนี้จากฐานข้อมูลก่อนวางแผนคืนล็อต
    if (isSupabaseActive && supabase && isOnline() && order.order_number) {
      const localConsumptions = normalizeLotConsumptions(
        getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, [])
      );
      const hasLocalRef = localConsumptions.some(
        (c) => c.reference_doc === order.order_number
      );
      if (!hasLocalRef) {
        try {
          const { data: remoteCons } = await supabase
            .from('lot_consumptions')
            .select('*')
            .eq('reference_doc', order.order_number);
          if (Array.isArray(remoteCons) && remoteCons.length > 0) {
            const mergedCons = normalizeLotConsumptions(
              mergeByLatestUpdate(remoteCons, localConsumptions)
            );
            setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, mergedCons);
          }
        } catch {
          // ใช้ข้อมูลในเครื่องตามเดิม
        }
      }
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
    let syncedProducts = normalizeAndSyncProducts(updatedProducts);
    const stockPlan = planStockMovements(products, syncedProducts, {
      movement_type: 'VOID',
      reference_doc: order.order_number,
    });

    // ยกเลิกบิลและคืนสต็อกในฐานข้อมูลด้วยคำสั่งเดียว (RPC void_order)
    // - อ้างอิงบิลด้วย id (บิลตั้งแต่ beta 0.3.6) หรือ order_number (บิลเก่าที่ id ในเครื่องเป็น ord-...)
    // - ฐานข้อมูลเปลี่ยนสถานะเฉพาะบิลที่ยัง completed กันคืนสต็อกซ้ำ ถ้าเครื่องอื่นยกเลิกไปแล้ว
    let alreadyVoidedRemotely = false;
    if (isSupabaseActive && supabase && (order.order_number || isUuid(order.id))) {
      const payload = {
        p_order_id: isUuid(order.id) ? order.id : null,
        p_order_number: order.order_number || null,
        p_restores: [...restoreByProductId.entries()]
          .filter(([id]) => isRemoteProductId(id))
          .map(([product_id, qty]) => ({ product_id, qty })),
        p_ledger: stockPlan.entries.filter((e) => isRemoteProductId(e.product_id)),
        p_lots: buildLotDeltas(stockPlan.lotPlan, order.order_number),
      };
      // บิลยังรอซิงค์อยู่ในคิว: ต่อคิวการยกเลิกไว้หลังบิล (คิวซิงค์ตามลำดับ)
      const queuedOrder = this.getOfflineQueue().some(
        (q) =>
          (q.kind === 'order_rpc' && q.payload?.p_order?.id === order.id) ||
          (q.kind === 'order' && q.order?.order_number === order.order_number)
      );
      const result =
        queuedOrder || !isOnline() ? { ok: false, networkError: true } : await pushVoidRpc(payload);
      if (result.networkError) {
        enqueueOffline({ kind: 'void_rpc', payload });
      } else if (!result.ok) {
        recordFailedSync({ kind: 'void_rpc', payload }, result.message);
      } else {
        alreadyVoidedRemotely = result.data?.status === 'already_voided';
        if (!alreadyVoidedRemotely) syncedProducts = applyRemoteBalances(syncedProducts, result.data?.balances);
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

    setLocal(STORAGE_KEYS.PRODUCTS, syncedProducts);
    // ฐานข้อมูลรับ Ledger/ล็อตไปพร้อมคำสั่งยกเลิกแล้ว (หรือเข้าคิว) จึงบันทึกเฉพาะในเครื่อง
    await commitStockMovements(stockPlan, isSupabaseActive, { remote: false });

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
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('wholesale_rules', [payload]);
    }

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
                is_wholesale_enabled: nextWholesaleEnabled,
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

  async deleteWholesaleRule(ruleId, currentProducts = null, isSupabaseActive = false) {
    const nowIso = new Date().toISOString();
    const rules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const targetRule = rules.find((r) => r.id === ruleId);
    const updated = rules.filter((r) => r.id !== ruleId);
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, updated);
    if (isSupabaseActive && supabase) {
      await deleteOrQueue('wholesale_rules', ruleId);
    }

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

          if (isSupabaseActive && supabase && !String(pid).startsWith('prod-')) {
            try {
              await supabase
                .from('products')
                .update({
                  is_wholesale_enabled: false,
                  wholesale_price: Number(targetProd.retail_price) || 0,
                  updated_at: nowIso,
                })
                .eq('id', pid);
            } catch {
              // fallback local
            }
          }

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
  async upsertSpecialRule(ruleData, isSupabaseActive = false) {
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
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('special_rules', [payload]);
    }
    return { savedRule: payload, updatedRules: updated };
  },

  async deleteSpecialRule(ruleId, isSupabaseActive = false) {
    const rules = getLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    const updated = rules.filter((r) => r.id !== ruleId);
    setLocal(STORAGE_KEYS.SPECIAL_RULES, updated);
    if (isSupabaseActive && supabase) {
      await deleteOrQueue('special_rules', ruleId);
    }
    return updated;
  },

  /**
   * บันทึกหรือแก้ไขข้อมูลผู้ผลิต (Supplier)
   */
  async upsertSupplier(supplierData, isSupabaseActive = false) {
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
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('suppliers', [payload]);
    }
    return { savedSupplier: payload, updatedSuppliers: updated };
  },

  async deleteSupplier(supplierId, isSupabaseActive = false) {
    const suppliers = getLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    const updated = suppliers.filter((s) => s.id !== supplierId);
    setLocal(STORAGE_KEYS.SUPPLIERS, updated);
    if (isSupabaseActive && supabase) {
      await deleteOrQueue('suppliers', supplierId);
    }
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
        importNumber,
        importPayload.warehouse_id
      );
    }

    const importRecord = {
      id: `imp-${Date.now()}`,
      import_number: importNumber,
      supplier_id: importPayload.supplier?.id || null,
      supplier_name: importPayload.supplier?.name || '-',
      supplier_phone: importPayload.supplier?.phone || '',
      warehouse_id: importPayload.warehouse_id || SALES_WAREHOUSE_ID,
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
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('stock_imports', [importRecord]);
    }

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
        target.import_number,
        importPayload.warehouse_id || target.warehouse_id
      );
    }

    const savedImport = {
      ...target,
      supplier_id: importPayload.supplier?.id || null,
      supplier_name: importPayload.supplier?.name || '-',
      supplier_phone: importPayload.supplier?.phone || '',
      warehouse_id: importPayload.warehouse_id || target.warehouse_id || SALES_WAREHOUSE_ID,
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
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('stock_imports', [savedImport]);
    }

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
        target.import_number,
        target.warehouse_id
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
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('stock_imports', [savedImport]);
    }

    return { savedImport, updatedImports, updatedProducts: syncedProducts };
  },

  /**
   * บันทึกตั้งค่าร้านค้าที่ใช้ร่วมกันทุกเครื่องลงตาราง shop_settings
   */
  async saveShopSettings(settings, isSupabaseActive = false) {
    const row = shopSettingsToRow(settings);
    if (isSupabaseActive && supabase) {
      await upsertOrQueue('shop_settings', [row]);
    }
    return row;
  },

  /**
   * สรุปจำนวนข้อมูลในเครื่องที่พร้อมอัปโหลดขึ้นฐานข้อมูล
   */
  getLocalDataSummary() {
    const suppliers = getLocal(STORAGE_KEYS.SUPPLIERS, []);
    const stockImports = getLocal(STORAGE_KEYS.STOCK_IMPORTS, []);
    const wholesaleRules = getLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    const specialRules = getLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    const units = getLocal(STORAGE_KEYS.UNITS, []);
    const lotConsumptions = getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []);
    const productMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    const customerMeta = getLocal(STORAGE_KEYS.CUSTOMER_META, {});
    return {
      suppliers: suppliers.length,
      stockImports: stockImports.length,
      wholesaleRules: wholesaleRules.length,
      specialRules: specialRules.length,
      units: units.length,
      lotConsumptions: lotConsumptions.length,
      productMetaCount: Object.keys(productMeta).length,
      customerMetaCount: Object.keys(customerMeta).length,
    };
  },

  /**
   * อัปโหลดข้อมูลที่เคยเก็บเฉพาะในเครื่องหลักขึ้นฐานข้อมูล Supabase (กดซ้ำได้ปลอดภัยด้วย upsert ตาม id)
   * รวมถึงซิงค์คอลัมน์เสริมของสินค้า (PRODUCT_META / ถังขยะ) และลูกค้า (CUSTOMER_META)
   */
  async uploadLocalDataToSupabase() {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('ยังไม่ได้เชื่อมต่อ Supabase กรุณาตั้งค่า .env ก่อนอัปโหลด');
    }
    if (!isOnline()) {
      throw new Error('ไม่สามารถอัปโหลดขณะออฟไลน์ได้ กรุณาเชื่อมต่ออินเทอร์เน็ต');
    }

    await this.flushOfflineQueue();

    const nowIso = new Date().toISOString();
    const errors = [];
    const counts = {
      shopSettings: 0,
      units: 0,
      suppliers: 0,
      stockImports: 0,
      wholesaleRules: 0,
      specialRules: 0,
      lotConsumptions: 0,
      productsUpdated: 0,
      customersUpdated: 0,
    };

    // 1. ตั้งค่าร้านค้าที่ใช้ร่วมกันทุกเครื่อง
    try {
      const shopRow = shopSettingsToRow(printerService.getLocalShopSettings(), nowIso);
      const { error } = await supabase.from('shop_settings').upsert([shopRow]);
      if (error) errors.push(`shop_settings: ${error.message}`);
      else counts.shopSettings = 1;
    } catch (err) {
      errors.push(`shop_settings: ${err.message}`);
    }

    // 2. หน่วยนับสินค้า
    const localUnits = getLocal(STORAGE_KEYS.UNITS, INITIAL_UNITS)
      .filter((u) => u && u.id && String(u.name || '').trim())
      .map((u) => ({ id: String(u.id), name: String(u.name).trim() }));
    if (localUnits.length > 0) {
      try {
        const { error } = await supabase.from('units').upsert(localUnits);
        if (error) errors.push(`units: ${error.message}`);
        else counts.units = localUnits.length;
      } catch (err) {
        errors.push(`units: ${err.message}`);
      }
    }

    // 3. ผู้ผลิต (Suppliers)
    const localSuppliers = getLocal(STORAGE_KEYS.SUPPLIERS, []).map((s) =>
      sanitizeSupplierRow(s, nowIso)
    );
    if (localSuppliers.length > 0) {
      try {
        const { error } = await supabase.from('suppliers').upsert(localSuppliers);
        if (error) errors.push(`suppliers: ${error.message}`);
        else counts.suppliers = localSuppliers.length;
      } catch (err) {
        errors.push(`suppliers: ${err.message}`);
      }
    }

    // 4. ใบนำเข้าสินค้า (Stock Imports)
    const localImports = normalizeStockImports(getLocal(STORAGE_KEYS.STOCK_IMPORTS, []));
    if (localImports.length > 0) {
      try {
        const { error } = await supabase.from('stock_imports').upsert(localImports);
        if (error) errors.push(`stock_imports: ${error.message}`);
        else counts.stockImports = localImports.length;
      } catch (err) {
        errors.push(`stock_imports: ${err.message}`);
      }
    }

    // 5. กฎราคาขายส่งหลายระดับ (Wholesale Rules)
    const localProducts = getLocal(STORAGE_KEYS.PRODUCTS, []);
    const localWholesaleRules = syncInitialWholesaleRulesWithProducts(
      localProducts,
      getLocal(STORAGE_KEYS.WHOLESALE_RULES, [])
    ).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim() || 'ราคาขายส่งหลายระดับ',
      type: r.type || r.target_type || 'single',
      target_type: r.target_type || r.type || 'single',
      product_id: r.product_id || null,
      product_ids: Array.isArray(r.product_ids) ? r.product_ids : [],
      tiers: Array.isArray(r.tiers) ? r.tiers : [],
      is_active: r.is_active !== false,
      created_at: r.created_at || nowIso,
      updated_at: r.updated_at || r.created_at || nowIso,
    }));
    if (localWholesaleRules.length > 0) {
      try {
        const { error } = await supabase.from('wholesale_rules').upsert(localWholesaleRules);
        if (error) errors.push(`wholesale_rules: ${error.message}`);
        else counts.wholesaleRules = localWholesaleRules.length;
      } catch (err) {
        errors.push(`wholesale_rules: ${err.message}`);
      }
    }

    // 6. กฎราคาพิเศษตามขั้นลูกค้า (Special Rules)
    const localSpecialRules = normalizeSpecialRules(
      getLocal(STORAGE_KEYS.SPECIAL_RULES, [])
    ).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim() || 'ราคาพิเศษ',
      type: r.type || r.target_type || 'single',
      target_type: r.target_type || r.type || 'single',
      product_id: r.product_id || null,
      product_ids: Array.isArray(r.product_ids) ? r.product_ids : [],
      tiers: Array.isArray(r.tiers) ? r.tiers : [],
      is_active: r.is_active !== false,
      created_at: r.created_at || nowIso,
      updated_at: r.updated_at || r.created_at || nowIso,
    }));
    if (localSpecialRules.length > 0) {
      try {
        const { error } = await supabase.from('special_rules').upsert(localSpecialRules);
        if (error) errors.push(`special_rules: ${error.message}`);
        else counts.specialRules = localSpecialRules.length;
      } catch (err) {
        errors.push(`special_rules: ${err.message}`);
      }
    }

    // 7. ประวัติการตัดล็อตตามเลขที่บิล (Lot Consumptions)
    const localLotConsumptions = normalizeLotConsumptions(
      getLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, [])
    );
    if (localLotConsumptions.length > 0) {
      try {
        const { error } = await supabase.from('lot_consumptions').upsert(localLotConsumptions);
        if (error) errors.push(`lot_consumptions: ${error.message}`);
        else counts.lotConsumptions = localLotConsumptions.length;
      } catch (err) {
        errors.push(`lot_consumptions: ${err.message}`);
      }
    }

    // 8. ซิงค์คอลัมน์เสริมของสินค้า (PRODUCT_META และถังขยะ) ขึ้นตาราง products
    const localMeta = getLocal(STORAGE_KEYS.PRODUCT_META, {});
    const localTrash = getLocal(STORAGE_KEYS.TRASH_PRODUCTS, []);
    const allLocalProds = [
      ...localProducts.map((p) => ({ ...p, is_trashed: false })),
      ...localTrash.map((t) => ({ ...t, is_trashed: true })),
    ].filter((p) => isRemoteProductId(p.id));

    for (const p of allLocalProds) {
      const meta = localMeta[p.id] || localMeta[p.sku] || {};
      const linkedId = p.linked_product_id || meta.linked_product_id || null;
      const patch = {
        is_wholesale_enabled: Boolean(
          p.is_wholesale_enabled ?? meta.is_wholesale_enabled
        ),
        selling_units:
          Array.isArray(p.selling_units) && p.selling_units.length > 0
            ? p.selling_units
            : meta.selling_units || [],
        linked_product_id: isUuid(linkedId) ? linkedId : null,
        linked_deduct_qty: Math.max(
          1,
          Number(p.linked_deduct_qty || meta.linked_deduct_qty) || 1
        ),
        lead_time_days: p.lead_time_days ?? meta.lead_time_days ?? null,
        safety_stock: p.safety_stock ?? meta.safety_stock ?? null,
        track_lots: Boolean(p.track_lots ?? meta.track_lots ?? false),
        lot_strategy: p.lot_strategy ?? meta.lot_strategy ?? 'FEFO',
        is_trashed: Boolean(p.is_trashed),
        deleted_at: p.is_trashed ? p.deleted_at || nowIso : null,
      };
      try {
        const { error } = await supabase.from('products').update(patch).eq('id', p.id);
        if (!error) counts.productsUpdated += 1;
      } catch {
        // ข้ามถ้าตารางยังไม่ได้เพิ่มคอลัมน์
      }
    }

    // 9. ซิงค์คอลัมน์เสริมของลูกค้า (CUSTOMER_META) ขึ้นตาราง customers
    const localCustomerMeta = getLocal(STORAGE_KEYS.CUSTOMER_META, {});
    const localCustomers = getLocal(STORAGE_KEYS.CUSTOMERS, []).filter((c) =>
      isUuid(c.id)
    );
    for (const c of localCustomers) {
      const merged = mergeCustomerMeta(c, localCustomerMeta);
      const patch = {
        special_price_tier: Number(merged.special_price_tier) || 0,
        tax_id: merged.tax_id || '',
        branch_number: merged.branch_number || '00000',
        credit_limit: Number(merged.credit_limit) || 0,
        credit_term_days: Number(merged.credit_term_days) || 30,
        is_blocked: Boolean(merged.is_blocked),
      };
      try {
        const { error } = await supabase.from('customers').update(patch).eq('id', c.id);
        if (!error) counts.customersUpdated += 1;
      } catch {
        // ข้ามถ้าตารางยังไม่ได้เพิ่มคอลัมน์
      }
    }

    return { counts, errors };
  },

  /**
   * ฝากคำสั่งเปิดบิลขายข้ามหน้า (จาก admin.html -> index.html)
   * เช่น เปิดบิลขายให้ลูกค้าที่เลือก หรือเปิดบิลจากใบสั่งขายส่ง (Sales Order)
   */
  setPendingPOSAction(action) {
    setLocal(STORAGE_KEYS.PENDING_POS_ACTION, action);
  },

  consumePendingPOSAction() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PENDING_POS_ACTION);
      if (!raw) return null;
      localStorage.removeItem(STORAGE_KEYS.PENDING_POS_ACTION);
      return JSON.parse(raw);
    } catch {
      return null;
    }
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
    setLocal(STORAGE_KEYS.SALES_ORDERS, []);
    setLocal(STORAGE_KEYS.LOT_CONSUMPTIONS, []);
    setLocal(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    setLocal(STORAGE_KEYS.STOCK_IMPORTS, []);
    setLocal(STORAGE_KEYS.ORDERS, INITIAL_ORDERS);
    setLocal(STORAGE_KEYS.WHOLESALE_RULES, []);
    setLocal(STORAGE_KEYS.SPECIAL_RULES, []);
    syncInitialWholesaleRulesWithProducts(resetProducts, []);
  },
};
