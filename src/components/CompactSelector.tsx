import React, { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface Option {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface CompactSelectorProps {
  label: string;
  options: Option[];
  selectedId: string;
  onChange: (id: string) => void;
  placeholder?: string;
  variant?: 'grid' | 'list';
}

export const CompactSelector: React.FC<CompactSelectorProps> = ({
  label,
  options,
  selectedId,
  onChange,
  placeholder = 'Seleccionar...',
  variant = 'list'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.id === selectedId);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div 
        className="form-select-trigger" 
        onClick={() => setIsOpen(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          {selectedOption ? (
            <>
              {selectedOption.icon && <span style={{ fontSize: 16 }}>{selectedOption.icon}</span>}
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {selectedOption.name}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>
          )}
        </div>
        <ChevronDown size={14} className="text-muted" style={{ flexShrink: 0 }} />
      </div>

      {isOpen && (
        <div className="modal-overlay" onClick={() => setIsOpen(false)} style={{ zIndex: 2000 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh' }}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h2 className="modal-title">{label}</h2>
              <button className="modal-close" onClick={() => setIsOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div className={variant === 'grid' ? 'selection-grid' : 'selection-list'} style={{ paddingBottom: 10 }}>
              {options.map(option => (
                <div
                  key={option.id}
                  className={`selection-item ${variant === 'list' ? 'selection-item-list' : ''} ${selectedId === option.id ? 'selected' : ''}`}
                  onClick={() => handleSelect(option.id)}
                >
                  {option.icon && <span className="selection-item-icon">{option.icon}</span>}
                  <span className="selection-item-name">{option.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
