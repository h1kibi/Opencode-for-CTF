# failure-pwn-cxx-object-field-offset-not-confirmed

## Trigger
- Challenge uses C++-style inventory/equipment/item/description objects.
- Rename/edit/new-name style input appears to affect more than a plain string field.

## Why it looks promising
- The solver sees stale behavior or corruption symptoms and keeps probing high-level object effects.

## What usually goes wrong
- Object-field offset confirmation is delayed.
- The solver keeps testing external behavior instead of proving which field or pointer is actually overwritten.
- AAR/AAW is postponed because wrapper/inner object layout is still implicit.

## Better question
- Which object field lies after the edited buffer, and which consumer reads that field later?

## First corrective probe
- Build an object-field table and confirm whether rename/edit crosses into description pointer, vtable-like pointer, or inner-object field.

## Stop rule
- Once edit/rename likely crosses an object boundary, do not stay in black-box symptom probing without one offset-confirmation probe.

## Reuse query terms
- cxx object field offset not confirmed
- inventory uaf description pointer overwrite
- wrapper inner object field crossing
