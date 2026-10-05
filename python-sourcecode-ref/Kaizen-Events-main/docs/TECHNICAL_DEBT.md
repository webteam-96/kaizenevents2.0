# Technical Debt & Future Improvements

*Last Updated: January 2026*

This document tracks technical debt items and planned improvements for the Kaizen Events platform.

---

## Priority Items

*(No high-priority technical debt items at this time)*

---

## Other Items

*(Add future technical debt items here)*

---

## Completed Items

### 1. ✅ Replaced Deprecated `react-beautiful-dnd` Library

**Status:** ✅ Completed (January 2026)  
**Priority:** Medium  
**Actual Effort:** 30 minutes  

**Issue:**
- `react-beautiful-dnd` was deprecated and no longer maintained by Atlassian
- Caused "Invariant failed: Cannot find droppable entry with id [form-fields]" errors
- Incompatible with React.StrictMode

**Solution Applied:**
Migrated to `@dnd-kit/core` and `@dnd-kit/sortable`

**Packages Installed:**
```bash
yarn add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
yarn remove react-beautiful-dnd
```

**Files Updated:**
- `/app/frontend/src/pages/FormBuilder.js` - Replaced DragDropContext/Droppable/Draggable with DndContext/SortableContext
- `/app/frontend/src/index.js` - Re-enabled React.StrictMode (now compatible)

**Benefits:**
- ✅ No more "Invariant failed" errors
- ✅ Compatible with React.StrictMode
- ✅ Better performance and accessibility
- ✅ Actively maintained library
- ✅ Supports React 18/19

---
