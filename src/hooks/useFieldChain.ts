import React, { useCallback } from 'react';

interface Field {
  ref: React.RefObject<any>;
  visible: boolean;
}

export function useFieldChain(
  fields: Field[],
  onLastSubmit: () => void
) {
  const getSubmitHandler = useCallback((index: number) => {
    return () => {
      // Find visible fields at the moment of submission
      const visibleFields = fields.filter(f => f.visible);
      const currentField = fields[index];

      if (!currentField || !currentField.visible) return;

      const visibleIndex = visibleFields.indexOf(currentField);

      if (visibleIndex === -1) return;

      if (visibleIndex < visibleFields.length - 1) {
        // Focus next visible field
        const nextField = visibleFields[visibleIndex + 1];
        if (nextField.ref.current) {
          if (typeof nextField.ref.current.focus === 'function') {
            nextField.ref.current.focus();
          }
        }
      } else {
        // Last visible field
        onLastSubmit();
      }
    };
  }, [fields, onLastSubmit]);

  const getReturnKeyType = useCallback((index: number) => {
    const visibleFields = fields.filter(f => f.visible);
    const currentField = fields[index];

    if (!currentField || !currentField.visible) return 'next';

    const visibleIndex = visibleFields.indexOf(currentField);
    if (visibleIndex === visibleFields.length - 1) {
      return 'done';
    }
    return 'next';
  }, [fields]);

  return { getSubmitHandler, getReturnKeyType };
}
