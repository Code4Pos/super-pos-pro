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
} from 'lucide-react';
import { usePOS } from '../context/POSContext';
import SearchableDropdown from '../components/common/SearchableDropdown';
import { formatCurrency } from '../utils/formatters';

const MAX_TIERS = 10;

export default function PricingTierPage({ mode = 'wholesale' }) {
  const isWholesale = mode === 'wholesale';

  const {
    products,
    wholesaleRules = [],
    specialRules = [],
    saveWholesaleRule,
    deleteWholesaleRule,
    saveSpecialRule,
    deleteSpecialRule,
    showToast,
  } = usePOS();

  const rules = isWholesale ? wholesaleRules : specialRules;
  const saveRule = isWholesale ? saveWholesaleRule : saveSpecialRule;
  const deleteRule = isWholesale ? deleteWholesaleRule : deleteSpecialRule;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'single' | 'group'

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
      if (filterType !== 'all' && rule.target_type !== filterType) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const nameMatch = rule.name?.toLowerCase().includes(q);
      const singleProd = productMap[rule.product_id];
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

  const openCreateModal = (defaultType = 'single') => {
    setEditingRule(null);
    setTargetType(defaultType);
    setRuleName('');
    setSelectedProductId(products[0]?.id || '');
    setSelectedProductIds([]);
    setGroupProductSearch('');
    setIsActive(true);
    setTiers([
      { step: 1, min_qty: 6, price: '' },
      { step: 2, min_qty: 12, price: '' },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    setTargetType(rule.target_type === 'group' ? 'group' : 'single');
    setRuleName(rule.name || '');
    setSelectedProductId(rule.product_id || '');
    setSelectedProductIds(Array.isArray(rule.product_ids) ? rule.product_ids : []);
    setGroupProductSearch('');
    setIsActive(rule.is_active !== false);
    setTiers(
      Array.isArray(rule.tiers) && rule.tiers.length > 0
        ? rule.tiers.slice(0, MAX_TIERS).map((t, idx) => ({
            step: idx + 1,
            min_qty: t.min_qty ?? '',
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

    const validTiers = tiers
      .map((t) => ({
        min_qty: Math.max(1, Number(t.min_qty) || 1),
        price: Number(t.price),
      }))
      .filter((t) => !Number.isNaN(t.price) && t.price >= 0)
      .sort((a, b) => a.min_qty - b.min_qty)
      .slice(0, MAX_TIERS)
      .map((t, idx) => ({
        step: idx + 1,
        min_qty: t.min_qty,
        price: t.price,
      }));

    if (validTiers.length === 0) {
      showToast('กรุณาระบุราคาอย่างน้อย 1 ขั้น', 'error');
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 p-3 sm:p-5 gap-4">
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
              {isWholesale ? 'ราคาขายส่งหลายระดับ' : 'ราคาพิเศษ'} (สูงสุด 10 ขั้น)
            </h1>
            <p className="text-xs text-slate-500">
              รองรับทั้งสินค้าแบบเดี่ยวและแบบกลุ่ม • ระบบเลือกใช้ราคาที่ถูกที่สุดให้อัตโนมัติตอนคิดเงิน
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* แถบค้นหาและตัวกรอง */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 w-fit">
          {[
            { id: 'all', label: `ทั้งหมด (${rules.length})` },
            {
              id: 'single',
              label: `แบบเดี่ยว (${rules.filter((r) => r.target_type !== 'group').length})`,
            },
            {
              id: 'group',
              label: `แบบกลุ่ม (${rules.filter((r) => r.target_type === 'group').length})`,
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
              ยังไม่มีรายการ{isWholesale ? 'ราคาขายส่งหลายระดับ' : 'ราคาพิเศษ'}
            </div>
            <p className="text-xs text-slate-400">
              กดปุ่ม &ldquo;ตั้งราคาแบบเดี่ยว&rdquo; หรือ &ldquo;ตั้งราคาแบบกลุ่ม&rdquo; ด้านบนเพื่อเริ่มต้น
            </p>
          </div>
        ) : (
          filteredRules.map((rule) => {
            const isGroup = rule.target_type === 'group';
            const singleProduct = !isGroup ? productMap[rule.product_id] : null;
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

                    {/* แสดงรายชื่อสินค้าในกลุ่ม */}
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

                  {/* ปุ่มเปิด/ปิด, แก้ไข, ลบ */}
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
                  {(rule.tiers || []).slice(0, MAX_TIERS).map((tier, idx) => (
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
                          ขั้นที่ {idx + 1}
                        </div>
                        <div className="font-bold text-slate-700">
                          ≥ {tier.min_qty}{' '}
                          {!isGroup && singleProduct ? singleProduct.unit : 'ชิ้น'}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-extrabold ${
                          isWholesale ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {formatCurrency(tier.price)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

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
                  {isWholesale ? 'ราคาขายส่งหลายระดับ' : 'ราคาพิเศษ'} (สูงสุด 10 ขั้น)
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
                      onChange={(val) => setSelectedProductId(val)}
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
                  <span className="text-xs font-bold text-slate-800">
                    ระดับราคา ({tiers.length}/{MAX_TIERS} ขั้น)
                  </span>
                  {tiers.length < MAX_TIERS && (
                    <button
                      type="button"
                      onClick={handleAddTier}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1"
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
                      <div className="col-span-3 sm:col-span-2">
                        <span className="inline-block px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                          ขั้นที่ {idx + 1}
                        </span>
                      </div>

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

                      <div className="col-span-4 flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 shrink-0">
                          ฿
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
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-right text-emerald-700"
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

