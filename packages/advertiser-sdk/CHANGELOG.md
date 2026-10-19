# @specify-sh/advertiser-sdk

## 0.2.0

### Minor Changes

- 86706c1: Batch consecutive browser events buffered by consent with the same identity, up to 50 events and 16 KiB per request. Send consented captures directly, even while buffered events are flushing; identification sends independently and never blocks events. Send browser and server captures using the events array expected by the updated events endpoint. Deploy the matching Edge endpoint before releasing this SDK version.
