---
"@specify-sh/wizard": patch
---

Make Space actually toggle the placement picker. The selection was wired
as a controlled value that never changed, so toggling repainted nothing
and every confirm returned the initial set. A hint under the picker now
says which keys do what.
