import React, { useState, useMemo } from 'react';
import {
  Tags,
  Sparkles,
  Plus,
  Search,
  Edit3,
  Trash2,
  Package,
  Layers,
  X,
  Save,
  Check,
  Users,
  Award,
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import SearchableDropdown from '../components/common/SearchableDropdown';
import { formatCurrency } from '../utils/formatters';

const MAX_TIERS = 10;

export default function PricingTierPage({ mode = 'wholesale' }) {
  const isWholesale = mode === 'wholesale';

  const {
    products,
    customers = [],
    wholesaleRules = [],
    specialRules = [],
    saveWholesaleRule,
    deleteWholesaleRule,
    saveSpecialRule,
    deleteSpecialRule,
    saveCustomer,
    showToast,
  } = usePOS();

  const rules = isWholesale ? wholesaleRules : specialRules;
  const saveRule = isWholesale ? saveWholesaleRule : saveSpecialRule;
  const deleteRule = isWholesale ? deleteWholesaleRule : deleteSpecialRule;

  // สำหรับหน้าราคาพิเศษ มี 2 โหมดย่อย: 'rules' (ตั้งราคาสินค้าแต่ละขั้น) และ 'customers' (ตั้งสิทธิของลูกค้าว่าซื้อได้ในราคาขั้นไหน)
  const [specialSubTab, setSpecialSubTab] = useState('rules');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'single' | 'group'
  const [customerSearch, setCustomerSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [targetType, setTargetType] = useState('single'); // 'single' | 'group'
  const [ruleName, setRuleName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [groupProductSearch, setGroupProductSearch] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [tiers, setTiers] = useState([
    { step: 1, min_qty: 6, price: '' },
    { step: 2, min_qty: 12, price: '' },
  ]);

  const productMap = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.sku})`,
      badge: `ปลีก ${formatCurrency(p.retail_price)} / ${p.unit}`,
    }));
  }, [products]);

  const filteredGroupProducts = useMemo(() => {
    const q = groupProductSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [products, groupProductSearch]);

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const rType = rule.target_type || rule.type || 'single';
      if (filterType !== 'all' && rType !== filterType) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const nameMatch = rule.name?.toLowerCase().includes(q);
      const singlePid =
        rule.product_id ||
        (Array.isArray(rule.product_ids) ? rule.product_ids[0] : null);
      const singleProd = productMap[singlePid];
      const singleMatch =
        singleProd &&
        (singleProd.name?.toLowerCase().includes(q) ||
          singleProd.sku?.toLowerCase().includes(q));
      const groupMatch =
        Array.isArray(rule.product_ids) &&
        rule.product_ids.some((pid) => {
          const gp = productMap[pid];
          return (
            gp &&
            (gp.name?.toLowerCase().includes(q) ||
              gp.sku?.toLowerCase().includes(q))
          );
        });

      return nameMatch || singleMatch || groupMatch;
    });
  }, [rules, filterType, searchQuery, productMap]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.shop_name?.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const loadExistingSingleRuleIfAny = (prodId) => {
    if (!prodId) return null;
    return rules.find(
      (r) =>
        (r.target_type || r.type) !== 'group' &&
        (r.product_id === prodId ||
          (Array.isArray(r.product_ids) &&
            r.product_ids.length === 1 &&
            r.product_ids[0] === prodId))
    );
  };

  const openCreateModal = (defaultType = 'single') => {
    const initialProdId = products[0]?.id || '';
    const existingSingle =
      defaultType === 'single' ? loadExistingSingleRuleIfAny(initialProdId) : null;

    setEditingRule(existingSingle || null);
    setTargetType(defaultType);
    setRuleName(existingSingle?.name || '');
    setSelectedProductId(initialProdId);
    setSelectedProductIds([]);
    setGroupProductSearch('');
    setIsActive(existingSingle ? existingSingle.is_active !== false : true);

    if (existingSingle && Array.isArray(existingSingle.tiers) && existingSingle.tiers.length > 0) {
      setTiers(
        existingSingle.tiers.slice(0, MAX_TIERS).map((t, idx) => ({
          step: idx + 1,
          min_qty: t.min_qty ?? (idx + 1) * 6,
          price: t.price ?? '',
        }))
      );
    } else {
      setTiers([
        { step: 1, min_qty: 6, price: '' },
        { step: 2, min_qty: 12, price: '' },
      ]);
    }
    setIsModalOpen(true);
  };

  const handleSelectSingleProductInModal = (prodId) => {
    setSelectedProductId(prodId);
    const existingSingle = loadExistingSingleRuleIfAny(prodId);
    if (existingSingle) {
      setEditingRule(existingSingle);
      setIsActive(existingSingle.is_active !== false);
      setTiers(
        (existingSingle.tiers || []).slice(0, MAX_TIERS).map((t, idx) => ({
          step: idx + 1,
          min_qty: t.min_qty ?? (idx + 1) * 6,
          price: t.price ?? '',
        }))
      );
    } else {
      setEditingRule(null);
    }
  };

  const openEditModal = (rule) => {
    const rType = rule.target_type || rule.type || 'single';
    const singlePid =
      rule.product_id ||
      (Array.isArray(rule.product_ids) ? rule.product_ids[0] : '');
    setEditingRule(rule);
    setTargetType(rType === 'group' ? 'group' : 'single');
    setRuleName(rule.name || '');
    setSelectedProductId(singlePid);
    setSelectedProductIds(Array.isArray(rule.product_ids) ? rule.product_ids : []);
    setGroupProductSearch('');
    setIsActive(rule.is_active !== false);
    setTiers(
      Array.isArray(rule.tiers) && rule.tiers.length > 0
        ? rule.tiers.slice(0, MAX_TIERS).map((t, idx) => ({
            step: idx + 1,
            min_qty: t.min_qty ?? (idx + 1) * 6,
            price: t.price ?? '',
          }))
        : [{ step: 1, min_qty: 6, price: '' }]
    );
    setIsModalOpen(true);
  };

  const handleAddTier = () => {
    if (tiers.length >= MAX_TIERS) return;
    const lastQty = Number(tiers[tiers.length - 1]?.min_qty) || 0;
    setTiers((prev) => [
      ...prev,
      {
        step: prev.length + 1,
        min_qty: lastQty + 6,
        price: '',
      },
    ]);
  };

  const handleRemoveTier = (index) => {
    if (tiers.length <= 1) return;
    setTiers((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((t, idx) => ({ ...t, step: idx + 1 }))
    );
  };

  const handleTierChange = (index, field, val) => {
    setTiers((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: val } : row))
    );
  };

  const toggleGroupProduct = (productId) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const handleToggleRuleActive = async (rule) => {
    await saveRule({
      ...rule,
      is_active: rule.is_active === false ? true : false,
    });
  };

  const handleChangeCustomerTier = async (customer, nextTier) => {
    await saveCustomer({
      ...customer,
      special_price_tier: Number(nextTier) || 0,
    });
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();

    if (targetType === 'single' && !selectedProductId) {
      showToast('กรุณาเลือกสินค้า', 'error');
      return;
    }

    if (targetType === 'group' && selectedProductIds.length === 0) {
      showToast('กรุณาเลือกสินค้าในกลุ่มอย่างน้อย 1 รายการ', 'error');
      return;
    }

    let validTiers = [];
    if (isWholesale) {
      validTiers = tiers
        .map((t) => ({
          min_qty: Math.max(1, Number(t.min_qty) || 1),
          price: Number(t.price),
        }))
        .filter((t) => !Number.isNaN(t.price) && t.price > 0)
        .sort((a, b) => a.min_qty - b.min_qty)
        .slice(0, MAX_TIERS)
        .map((t, idx) => ({
          step: idx + 1,
          level: idx + 1,
          min_qty: t.min_qty,
          price: t.price,
        }));
    } else {
      // ระบบราคาพิเศษ: ตั้งราคาแต่ละขั้น (ขั้นที่ 1..10) ตามลำดับขั้น
      validTiers = tiers
        .map((t, idx) => ({
          step: idx + 1,
          level: idx + 1,
          price: Number(t.price),
        }))
        .filter((t) => !Number.isNaN(t.price) && t.price > 0)
        .slice(0, MAX_TIERS)
        .map((t, idx) => ({
          step: idx + 1,
          level: idx + 1,
          price: t.price,
        }));
    }

    if (validTiers.length === 0) {
      showToast('กรุณาระบุราคาที่มากกว่า 0 อย่างน้อย 1 ขั้น', 'error');
      return;
    }

    const singleProd = productMap[selectedProductId];
    const resolvedName =
      ruleName.trim() ||
      (targetType === 'single'
        ? singleProd?.name || 'รายการเดี่ยว'
        : `กลุ่มสินค้า (${selectedProductIds.length} รายการ)`);

    await saveRule({
      id: editingRule?.id || null,
      name: resolvedName,
      type: targetType,
      target_type: targetType,
      product_id: targetType === 'single' ? selectedProductId : null,
      product_ids:
        targetType === 'group' ? selectedProductIds : [selectedProductId],
      tiers: validTiers,
      is_active: isActive,
    });

    setIsModalOpen(false);
  };

  const selectedSingleProd = productMap[selectedProductId];
  const customersWithSpecialPrivilegeCount = customers.filter(
    (c) => (Number(c.special_price_tier) || 0) > 0
  ).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-3.5">
      {/* แถบหัวข้อและปุ่มสร้างรายการ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 ${
              isWholesale ? 'bg-emerald-600' : 'bg-amber-500'
            }`}
          >
            {isWholesale ? (
              <Tags className="w-5 h-5" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900">
              {isWholesale ? 'ราคาขายส่งหลายระดับ' : 'ระบบราคาพิเศษตามสิทธิลูกค้า'} (สูงสุด 10 ขั้น)
            </h1>
            <p className="text-xs text-slate-500">
              {isWholesale
                ? 'ซิงก์กับราคาขายส่งในหน้าแก้ไขข้อมูลสินค้าอัตโนมัติ • รองรับทั้งแบบเดี่ยวและแบบกลุ่ม'
                : 'ตั้งราคาสินค้าแต่ละขั้น (1-10) และกำหนดสิทธิขั้นราคาของลูกค้า • หากตั้งราคาไว้ต่ำกว่าขั้นสิทธิลูกค้า ระบบใช้ขั้นสูงสุดที่ตั้งไว้ให้อัตโนมัติ'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isWholesale && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setSpecialSubTab('rules')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  specialSubTab === 'rules'
                    ? 'bg-white text-amber-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ตั้งราคาพิเศษสินค้า ({rules.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSpecialSubTab('customers')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  specialSubTab === 'customers'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>
                  ตั้งสิทธิของลูกค้า ({customersWithSpecialPrivilegeCount}/
                  {customers.length})
                </span>
              </button>
            </div>
          )}

          {(isWholesale || specialSubTab === 'rules') && (
            <>
              <button
                type="button"
                onClick={() => openCreateModal('single')}
                className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors ${
                  isWholesale
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>ตั้งราคาแบบเดี่ยว</span>
              </button>

              <button
                type="button"
                onClick={() => openCreateModal('group')}
                className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Layers className="w-4 h-4" />
                <span>ตั้งราคาแบบกลุ่ม</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* กรณีโหมดตั้งสิทธิของลูกค้าในหน้าราคาพิเศษ */}
      {!isWholesale && specialSubTab === 'customers' ? (
        <div className="flex-1 flex flex-col overflow-hidden gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Award className="w-4 h-4 text-amber-500" />
              <span>
                กำหนดสิทธิระดับราคาพิเศษของลูกค้าแต่ละราย (ขั้นที่ 1 - 10) • กรณีสินค้าตั้งไว้ถึงแค่ขั้น 2 แต่ลูกค้าได้สิทธิขั้น 10 ระบบจะใช้ราคาขั้น 2 ให้อัตโนมัติ
              </span>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า, รหัสลูกค้า หรือเบอร์โทร..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {filteredCustomers.map((cus) => {
              const currentTier = Number(cus.special_price_tier) || 0;
              return (
                <div
                  key={cus.id}
                  className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        {cus.code}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {cus.name}
                      </span>
                      {cus.shop_name && cus.shop_name !== '-' && (
                        <span className="text-xs text-slate-500">
                          ({cus.shop_name})
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          currentTier > 0
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {currentTier > 0
                          ? `สิทธิราคาพิเศษ ขั้นที่ ${currentTier}`
                          : 'ไม่มีสิทธิราคาพิเศษ'}
                      </span>
                    </div>
                  </div>

                  {/* ปุ่มเลือกขั้นสิทธิราคาพิเศษ 0 - 10 */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleChangeCustomerTier(cus, 0)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        currentTier === 0
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      ไม่มีสิทธิ
                    </button>
                    {Array.from({ length: 10 }, (_, idx) => idx + 1).map(
                      (stepNum) => (
                        <button
                          key={stepNum}
                          type="button"
                          onClick={() => handleChangeCustomerTier(cus, stepNum)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            currentTier === stepNum
                              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
                          }`}
                        >
                          ขั้น {stepNum}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* แถบค้นหาและตัวกรองรายการราคา */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 w-fit">
              {[
                { id: 'all', label: `ทั้งหมด (${rules.length})` },
                {
                  id: 'single',
                  label: `แบบเดี่ยว (${
                    rules.filter((r) => (r.target_type || r.type) !== 'group')
                      .length
                  })`,
                },
                {
                  id: 'group',
                  label: `แบบกลุ่ม (${
                    rules.filter((r) => (r.target_type || r.type) === 'group')
                      .length
                  })`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    filterType === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อรายการ, ชื่อสินค้า หรือรหัส SKU..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* รายการที่ตั้งไว้ */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
            {filteredRules.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  {isWholesale ? (
                    <Tags className="w-6 h-6" />
                  ) : (
                    <Sparkles className="w-6 h-6" />
                  )}
                </div>
                <div className="text-sm font-bold text-slate-700">
                  ยังไม่มีรายการ
                  {isWholesale ? 'ราคาขายส่งหลายระดับ' : 'ราคาพิเศษ'}
                </div>
                <p className="text-xs text-slate-400">
                  กดปุ่ม &ldquo;ตั้งราคาแบบเดี่ยว&rdquo; หรือ &ldquo;ตั้งราคาแบบกลุ่ม&rdquo; ด้านบนเพื่อเริ่มต้น
                </p>
              </div>
            ) : (
              filteredRules.map((rule) => {
                const isGroup = (rule.target_type || rule.type) === 'group';
                const singlePid =
                  rule.product_id ||
                  (Array.isArray(rule.product_ids) ? rule.product_ids[0] : null);
                const singleProduct = !isGroup ? productMap[singlePid] : null;
                const groupProducts = isGroup
                  ? (rule.product_ids || [])
                      .map((pid) => productMap[pid])
                      .filter(Boolean)
                  : [];

                return (
                  <div
                    key={rule.id}
                    className={`bg-white rounded-2xl border p-4 transition-all space-y-3 ${
                      rule.is_active === false
                        ? 'border-slate-200 opacity-60'
                        : 'border-slate-200/90 hover:border-indigo-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isGroup
                                ? 'bg-violet-100 text-violet-800'
                                : isWholesale
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isGroup
                              ? `แบบกลุ่ม (${groupProducts.length} สินค้า)`
                              : 'แบบเดี่ยว'}
                          </span>

                          <h3 className="text-sm font-extrabold text-slate-900 truncate">
                            {isGroup
                              ? rule.name
                              : singleProduct?.name || rule.name}
                          </h3>

                          {!isGroup && singleProduct && (
                            <span className="text-xs font-mono text-slate-400">
                              [{singleProduct.sku}] • ราคาปลีก{' '}
                              {formatCurrency(singleProduct.retail_price)}/
                              {singleProduct.unit}
                            </span>
                          )}
                        </div>

                        {isGroup && groupProducts.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            {groupProducts.map((gp) => (
                              <span
                                key={gp.id}
                                className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium"
                              >
                                {gp.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rule.is_active !== false}
                          onClick={() => handleToggleRuleActive(rule)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            rule.is_active !== false
                              ? isWholesale
                                ? 'bg-emerald-600'
                                : 'bg-amber-500'
                              : 'bg-slate-300'
                          }`}
                          title="เปิด/ปิดการใช้งาน"
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                              rule.is_active !== false
                                ? 'translate-x-5'
                                : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(rule)}
                          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600"
                          title="แก้ไข"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteRule(rule.id)}
                          className="p-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600"
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* ตารางขั้นบันได (สูงสุด 10 ขั้น) */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                      {(rule.tiers || []).slice(0, MAX_TIERS).map((tier, idx) => {
                        const stepNum = tier.step || tier.level || idx + 1;
                        return (
                          <div
                            key={idx}
                            className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs ${
                              isWholesale
                                ? 'bg-emerald-50/40 border-emerald-200/80'
                                : 'bg-amber-50/40 border-amber-200/80'
                            }`}
                          >
                            <div>
                              <div className="text-[10px] font-bold text-slate-400">
                                ขั้นที่ {stepNum}
                              </div>
                              <div className="font-bold text-slate-700">
                                {isWholesale
                                  ? `≥ ${tier.min_qty} ${
                                      !isGroup && singleProduct
                                        ? singleProduct.unit
                                        : 'ชิ้น'
                                    }`
                                  : `สิทธิลูกค้าขั้น ${stepNum}`}
                              </div>
                            </div>
                            <div
                              className={`text-sm font-extrabold ${
                                isWholesale
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {formatCurrency(tier.price)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Modal เพิ่ม/แก้ไขรายการ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {isWholesale ? (
                  <Tags className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-400" />
                )}
                <h3 className="text-sm font-bold">
                  {editingRule ? 'แก้ไข' : 'สร้าง'}
                  {isWholesale ? 'ราคาขายส่งหลายระดับ' : 'ราคาพิเศษตามขั้นสิทธิลูกค้า'}{' '}
                  (สูงสุด 10 ขั้น)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveRule}
              className="p-5 overflow-y-auto space-y-4"
            >
              {/* สลับประเภท แบบเดี่ยว / แบบกลุ่ม */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => setTargetType('single')}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    targetType === 'single'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>สินค้าแบบเดี่ยว</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('group')}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    targetType === 'group'
                      ? 'bg-white text-violet-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>สินค้าแบบกลุ่ม</span>
                </button>
              </div>

              {/* เลือกสินค้าแบบเดี่ยว หรือ แบบกลุ่ม */}
              {targetType === 'single' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      เลือกสินค้า *
                    </label>
                    <SearchableDropdown
                      value={selectedProductId}
                      onChange={(val) => handleSelectSingleProductInModal(val)}
                      options={productOptions}
                      icon={Package}
                      placeholder="พิมพ์ค้นหาชื่อสินค้า หรือรหัส SKU..."
                    />
                  </div>

                  {selectedSingleProd && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">
                        ราคาปลีกปกติ:{' '}
                        <strong className="text-slate-900">
                          {formatCurrency(selectedSingleProd.retail_price)}
                        </strong>{' '}
                        / {selectedSingleProd.unit}
                      </span>
                      <span className="text-slate-500">
                        ต้นทุน {formatCurrency(selectedSingleProd.cost_price)}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      ชื่อกลุ่มสินค้า *
                    </label>
                    <input
                      type="text"
                      required
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      placeholder="เช่น กลุ่มเครื่องดื่มคละรส, กลุ่มขนมซอง..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        เลือกสินค้าในกลุ่ม ({selectedProductIds.length} รายการ)
                      </label>
                      {selectedProductIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedProductIds([])}
                          className="text-[11px] font-bold text-rose-600 hover:underline"
                        >
                          ล้างที่เลือก
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={groupProductSearch}
                      onChange={(e) => setGroupProductSearch(e.target.value)}
                      placeholder="ค้นหาสินค้าเพื่อเพิ่มเข้ากลุ่ม..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                    />

                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {filteredGroupProducts.map((prod) => {
                        const checked = selectedProductIds.includes(prod.id);
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => toggleGroupProduct(prod.id)}
                            className={`w-full px-3 py-2 flex items-center justify-between text-left text-xs transition-colors ${
                              checked
                                ? 'bg-violet-50/80 text-violet-950 font-bold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                  checked
                                    ? 'bg-violet-600 border-violet-600 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {checked && <Check className="w-3 h-3" />}
                              </div>
                              <span className="truncate">{prod.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">
                                ({prod.sku})
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 shrink-0">
                              {formatCurrency(prod.retail_price)}/{prod.unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ตารางกำหนดขั้นราคา (สูงสุด 10 ขั้น) */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      {isWholesale
                        ? `ระดับราคาขายส่ง (${tiers.length}/${MAX_TIERS} ขั้น)`
                        : `ระดับราคาพิเศษตามขั้นสิทธิลูกค้า (${tiers.length}/${MAX_TIERS} ขั้น)`}
                    </span>
                    {!isWholesale && (
                      <p className="text-[11px] text-slate-500">
                        หากตั้งไว้ถึงแค่ขั้นที่ {tiers.length} แต่ลูกค้ามีสิทธิสูงกว่า ระบบจะใช้ราคาขั้นที่ {tiers.length} ให้อัตโนมัติ
                      </p>
                    )}
                  </div>
                  {tiers.length < MAX_TIERS && (
                    <button
                      type="button"
                      onClick={handleAddTier}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>เพิ่มขั้น ({tiers.length}/10)</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {tiers.map((tier, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200"
                    >
                      <div
                        className={
                          isWholesale
                            ? 'col-span-3 sm:col-span-2'
                            : 'col-span-5 sm:col-span-5'
                        }
                      >
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700">
                          ขั้นที่ {idx + 1}
                          {!isWholesale && ` (สำหรับลูกค้าสิทธิขั้น ${idx + 1})`}
                        </span>
                      </div>

                      {isWholesale && (
                        <div className="col-span-4 sm:col-span-5 flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 shrink-0">
                            ตั้งแต่
                          </span>
                          <input
                            type="number"
                            min="1"
                            required
                            value={tier.min_qty}
                            onChange={(e) =>
                              handleTierChange(idx, 'min_qty', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-center text-slate-900"
                            placeholder="จำนวน"
                          />
                          <span className="text-[11px] text-slate-500 shrink-0">
                            ขึ้นไป
                          </span>
                        </div>
                      )}

                      <div
                        className={
                          isWholesale
                            ? 'col-span-4 flex items-center gap-1.5'
                            : 'col-span-6 flex items-center gap-1.5'
                        }
                      >
                        <span className="text-[11px] text-slate-500 shrink-0">
                          ราคา ฿
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={tier.price}
                          onChange={(e) =>
                            handleTierChange(idx, 'price', e.target.value)
                          }
                          className={`w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-right ${
                            isWholesale ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                          placeholder="ราคา/หน่วย"
                        />
                      </div>

                      <div className="col-span-1 flex justify-end">
                        {tiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>บันทึก</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
