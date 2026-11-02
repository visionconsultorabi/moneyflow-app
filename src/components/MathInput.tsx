import React, { forwardRef, useRef } from 'react';
import { evaluateMathExpression, hasMathOperation } from '../lib/mathUtils';

export interface MathInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: string;
  onEnterEvaluated?: (result: number) => void;
}

export const MathInput = forwardRef<HTMLInputElement, MathInputProps>(({
  value,
  onChange,
  onKeyDown,
  onBlur,
  className = 'form-input',
  placeholder = '0',
  title,
  ...restProps
}, forwardedRef) => {
  const internalRef = useRef<HTMLInputElement | null>(null);

  const handleRef = (node: HTMLInputElement | null) => {
    internalRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    }
  };

  const stringValue = value !== undefined && value !== null ? String(value) : '';

  // Trigger synthetic change event for React controlled inputs
  const emitValue = (newVal: string, originalEvent?: React.SyntheticEvent) => {
    if (internalRef.current) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(internalRef.current, newVal);
      }
      internalRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (onChange) {
      const syntheticEvent = {
        ...(originalEvent || {}),
        target: {
          ...(internalRef.current || {}),
          value: newVal,
          name: restProps.name || '',
        },
        currentTarget: {
          ...(internalRef.current || {}),
          value: newVal,
          name: restProps.name || '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;

    // Filter out invalid characters, allowing only numbers, math symbols and separators
    val = val.replace(/[^0-9+\-*/xX%(),.\s=]/g, '');

    // If user typed '=' at the end (calculator habit), evaluate immediately
    if (val.endsWith('=')) {
      const expr = val.slice(0, -1);
      const evaluated = evaluateMathExpression(expr);
      if (evaluated !== null) {
        emitValue(String(evaluated), e);
        return;
      }
      val = expr;
    }

    if (val !== e.target.value) {
      emitValue(val, e);
    } else {
      onChange?.(e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const currentVal = internalRef.current?.value || stringValue;
      if (hasMathOperation(currentVal)) {
        const evaluated = evaluateMathExpression(currentVal);
        if (evaluated !== null) {
          e.preventDefault();
          e.stopPropagation();
          emitValue(String(evaluated), e);
          restProps.onEnterEvaluated?.(evaluated);
          return;
        }
      }
    }

    onKeyDown?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const currentVal = internalRef.current?.value || stringValue;
    if (hasMathOperation(currentVal)) {
      const evaluated = evaluateMathExpression(currentVal);
      if (evaluated !== null) {
        emitValue(String(evaluated), e);
      }
    }

    onBlur?.(e);
  };

  // Preview tooltip if a math expression is typed
  let computedTitle = title;
  if (hasMathOperation(stringValue)) {
    const preview = evaluateMathExpression(stringValue);
    if (preview !== null) {
      computedTitle = `= ${preview} (Presiona Enter para calcular)`;
    }
  }

  return (
    <input
      {...restProps}
      ref={handleRef}
      type="text"
      inputMode="text"
      className={className}
      placeholder={placeholder}
      value={value}
      title={computedTitle}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
});

MathInput.displayName = 'MathInput';
