import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Edit3,
  Trash2,
  Check,
  FolderKanban,
  Scale,
  Search,
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import ConfirmModal from '../common/ConfirmModal';

/**
 * CategoryUnitModal (version beta 0.1.4):
 * หน้าต่างจัดการ "หมวดหมู่สินค้า" และ "หน่วยนับสินค้า"
 * รองรับการ เพิ่ม (Add), แก้ไข (Edit) และ ลบ (Delete) ได้อย่างครบถ้วน
 */
export default function CategoryUnitModal({
  isOpen,
  onClose,
  initialTab = 'categories', // 'categories' | 'units'
}) {
  const {
    categories,
    units,
    products,
    addCategory,
    updateCategory,
    deleteCategory,
    addUnit,
    updateUnit,
    deleteUnit,
  } = usePOS();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const [itemToDelete, setItemToDelete] = useState(null); // { type: 'category' | 'unit', item }

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'categories');
      setNewName('');
      setSearchQuery('');
      setEditingId(null);
      setEditingValue('');
    }
  }, [isOpen, initialTab]);

  const editableCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories
      .filter((c) => c.id !== 'all')
      .filter((c) => !q || c.name?.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  const editableUnits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return units.filter((u) => !q || u.name?.toLowerCase().includes(q));
  }, [units, searchQuery]);

  if (!isOpen) return null;

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const clean = newName.trim();
    if (!clean) return;

    if (activeTab === 'categories') {
      await addCategory({ name: clean });
    } else {
      await addUnit({ name: clean });
    }
    setNewName('');
  };

  const handleSaveEdit = async (id) => {
    const clean = editingValue.trim();
    if (!clean) return;

    if (activeTab === 'categories') {
      await updateCategory(id, { name: clean });
    } else {
      await updateUnit(id, { name: clean });
    }
    setEditingId(null);
    setEditingValue('');
  };

  const getProductCountForCategory = (catId) =>
    products.filter((p) => p.category_id === catId).length;

  const getProductCountForUnit = (unitName) =>
    products.filter(
      (p) =>
        p.unit === unitName ||
        (Array.isArray(p.selling_units) &&
          p.selling_units.some((su) => su.unit === unitName))
    ).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88dvh]">
        {/* ส่วนหัว Modal */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            {activeTab === 'categories' ? (
              <FolderKanban className="w-5 h-5 text-indigo-400" />
            ) : (
              <Scale className="w-5 h-5 text-emerald-400" />
            )}
            <h3 className="text-base font-bold">
              การจัดการหมวดหมู่สินค้า & หน่วยนับ
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* แท็บสลับ หมวดหมู่สินค้า / หน่วยนับ */}
        <div className="p-2.5 bg-slate-100 border-b border-slate-200 grid grid-cols-2 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('categories');
              setEditingId(null);
              setNewName('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'categories'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>หมวดหมู่สินค้า ({categories.filter((c) => c.id !== 'all').length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('units');
              setEditingId(null);
              setNewName('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'units'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>หน่วยนับสินค้า ({units.length})</span>
          </button>
        </div>

        {/* ฟอร์มเพิ่มรายการใหม่ + ค้นหา */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-2.5 shrink-0">
          <form onSubmit={handleAddSubmit} className="flex items-center gap-2">
            <input
              type="text"
              data-allow-scanner="false"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                activeTab === 'categories'
                  ? 'ระบุชื่อหมวดหมู่ใหม่ เช่น ข้าวสาร & อาหารแห้ง...'
                  : 'ระบุชื่อหน่วยนับใหม่ เช่น ลัง, โหล, แพ็ค 6...'
              }
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className={`px-4 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0 transition-colors ${
                activeTab === 'categories'
                  ? 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>
                {activeTab === 'categories' ? 'เพิ่มหมวดหมู่' : 'เพิ่มหน่วยนับ'}
              </span>
            </button>
          </form>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-allow-scanner="false"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'categories'
                  ? 'ค้นหาชื่อหมวดหมู่...'
                  : 'ค้นหาชื่อหน่วยนับ...'
              }
              className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* รายการ หมวดหมู่ หรือ หน่วยนับ พร้อมปุ่ม แก้ไข / ลบ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {activeTab === 'categories' ? (
            editableCategories.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                ไม่พบหมวดหมู่สินค้า
              </div>
            ) : (
              editableCategories.map((cat) => {
                const isEditing = editingId === cat.id;
                const count = getProductCountForCategory(cat.id);

                return (
                  <div
                    key={cat.id}
                    className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 flex items-center justify-between gap-2 transition-colors"
                  >
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          data-allow-scanner="false"
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(cat.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-indigo-400 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(cat.id)}
                          className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                          title="บันทึกการแก้ไข"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                          title="ยกเลิก"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                            {cat.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 shrink-0">
                            {count} สินค้า
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(cat.id);
                              setEditingValue(cat.name);
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>แก้ไข</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setItemToDelete({ type: 'category', item: cat })
                            }
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ลบ</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )
          ) : editableUnits.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              ไม่พบหน่วยนับสินค้า
            </div>
          ) : (
            editableUnits.map((u) => {
              const isEditing = editingId === u.id;
              const count = getProductCountForUnit(u.name);

              return (
                <div
                  key={u.id}
                  className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-emerald-200 flex items-center justify-between gap-2 transition-colors"
                >
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        data-allow-scanner="false"
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(u.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-emerald-400 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(u.id)}
                        className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                        title="บันทึกการแก้ไข"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                        title="ยกเลิก"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex items-center gap-2.5">
                        <span className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                          {u.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 shrink-0">
                          ใช้ใน {count} รายการ
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(u.id);
                            setEditingValue(u.name);
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setItemToDelete({ type: 'unit', item: u })
                          }
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบ</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ส่วนท้าย Modal */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>

      {/* Confirm ยืนยันการลบหมวดหมู่ หรือ หน่วยนับ */}
      <ConfirmModal
        isOpen={Boolean(itemToDelete)}
        title={
          itemToDelete?.type === 'category'
            ? 'ยืนยันการลบหมวดหมู่สินค้า'
            : 'ยืนยันการลบหน่วยนับสินค้า'
        }
        message={
          itemToDelete
            ? `คุณต้องการลบ${
                itemToDelete.type === 'category' ? 'หมวดหมู่' : 'หน่วยนับ'
              } "${itemToDelete.item.name}" ออกจากระบบใช่หรือไม่?`
            : ''
        }
        confirmText="ยืนยันการลบ"
        cancelText="ยกเลิก"
        variant="danger"
        onCancel={() => setItemToDelete(null)}
        onConfirm={async () => {
          if (!itemToDelete) return;
          if (itemToDelete.type === 'category') {
            await deleteCategory(itemToDelete.item.id);
          } else {
            await deleteUnit(itemToDelete.item.id);
          }
          setItemToDelete(null);
        }}
      />
    </div>
  );
}

