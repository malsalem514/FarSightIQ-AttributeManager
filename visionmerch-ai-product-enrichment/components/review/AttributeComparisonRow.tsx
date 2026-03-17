/**
 * AttributeComparisonRow - Three-way comparison (DB | Vendor | AI) with inline editing
 * 
 * Pattern: Vanilla React component following AttributeGroupAccordion.tsx style
 */

import React, { useState } from 'react';
import { GroupedAttributeComparison, AttributeComparison } from '../../types';
import { ChevronDown, ChevronUp, Check, X, Edit2, Database, FileText, Sparkles } from 'lucide-react';

interface AttributeComparisonRowProps {
  group: GroupedAttributeComparison;
}

export const AttributeComparisonRow: React.FC<AttributeComparisonRowProps> = ({ group }) => {
  const [isExpanded, setIsExpanded] = useState(group.is_expanded);
  const percent = group.completeness.total > 0
    ? Math.round((group.completeness.filled / group.completeness.total) * 100)
    : 0;

  return (
    <div className="rounded-xl border-2 border-gray-100 overflow-hidden bg-white">
      {/* Group Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        data-testid={`comparison-group-${group.group_id}`}
      >
        <div className="flex items-center gap-3 flex-1">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          <div className="text-left flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900">{group.group_name}</span>
              <span className="text-xs text-gray-400">({group.attributes.length})</span>
            </div>
            <div className="mt-1 w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percent >= 80 ? 'bg-green-500' : percent >= 60 ? 'bg-blue-500' : 'bg-amber-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {group.completeness.filled} / {group.completeness.total} filled
          </div>
        </div>
      </button>

      {/* Expanded Attributes */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4 space-y-2">
          {group.attributes.map((attr, idx) => (
            <AttributeComparisonCell key={`${attr.type_id}-${idx}`} attribute={attr} />
          ))}
        </div>
      )}
    </div>
  );
};

// Split into separate component to keep under 100 LOC
interface AttributeComparisonCellProps {
  attribute: AttributeComparison;
}

const AttributeComparisonCell: React.FC<AttributeComparisonCellProps> = ({ attribute }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(attribute.selected_value || '');
  const isMandatory = attribute.mandatory === 'Y';

  const handleAccept = () => {
    console.log('Accepting attribute:', attribute.type_id);
    // TODO: Call API to save
  };

  const handleReject = () => {
    console.log('Rejecting attribute:', attribute.type_id);
    // TODO: Call API
  };

  const handleSaveEdit = () => {
    console.log('Saving edit:', attribute.type_id, editValue);
    setIsEditing(false);
    // TODO: Call API
  };

  return (
    <div
      className="p-3 rounded-lg bg-white border border-gray-100"
      data-testid={`attr-comparison-${attribute.type_id}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-900">{attribute.name}</span>
          {isMandatory && (
            <span className="text-[8px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded uppercase border border-red-100">
              Mandatory
            </span>
          )}
          {attribute.applicability && attribute.applicability !== 'OPTIONAL' && (
            <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase border border-blue-100">
              {attribute.applicability}
            </span>
          )}
        </div>
        {attribute.confidence > 0 && (
          <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded">
            AI {attribute.confidence}%
          </span>
        )}
      </div>

      {/* Three-way comparison */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* DB Value */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Database size={10} className="text-gray-400" />
            <span className="text-[9px] text-gray-400 font-bold uppercase">DB</span>
          </div>
          <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 truncate">
            {attribute.db_value || '—'}
          </div>
        </div>

        {/* Vendor Value */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <FileText size={10} className="text-amber-500" />
            <span className="text-[9px] text-amber-600 font-bold uppercase">Vendor</span>
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded border border-amber-100 truncate">
            {attribute.vendor_value || '—'}
          </div>
        </div>

        {/* AI Value */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Sparkles size={10} className="text-violet-500" />
            <span className="text-[9px] text-violet-600 font-bold uppercase">AI</span>
          </div>
          <div className="text-xs text-violet-700 bg-violet-50 px-2 py-1.5 rounded border border-violet-100 truncate font-semibold">
            {attribute.ai_value || '—'}
          </div>
        </div>
      </div>

      {/* Edit Mode */}
      {isEditing ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
            autoFocus
          />
          <button
            onClick={handleSaveEdit}
            className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-[10px] font-bold uppercase hover:bg-green-200 transition-all"
          >
            <Check size={12} />
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-200 transition-all"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        /* Action Buttons */
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-[10px] font-bold uppercase hover:bg-green-200 transition-all"
          >
            <Check size={12} /> Accept
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-200 transition-all"
          >
            <Edit2 size={12} /> Edit
          </button>
          <button
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-200 transition-all"
          >
            <X size={12} /> Reject
          </button>
        </div>
      )}
    </div>
  );
};

