package com.akihlee.documents;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Restores real values in place of PII redaction tokens before a response
 * leaves core-api. The redaction (see document-worker's pii_redactor.py)
 * exists to keep PII away from the AI vendor (Bedrock/Claude) that reads
 * the document, not to hide it from the tenant's own users — they should
 * always see their real data, so rehydration happens at the response
 * boundary, every time.
 *
 * Deliberately never called before a save — only ever applied to an
 * entity already detached from the persistence context (after a
 * repository call returns, in a controller with no surrounding
 * @Transactional spanning the method), so a rehydrated field can never
 * accidentally get flushed back to the database in place of the
 * tokenized value that belongs there. Rehydrating, then saving, would
 * quietly re-leak real PII into a column meant to stay tokenized at rest.
 */
@Service
public class PiiRehydrationService {

    private final ObjectMapper objectMapper;

    public PiiRehydrationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** Rehydrates merchantName, rawText, and every line item's text fields, in place. */
    public void rehydrate(ExtractedData data) {
        Map<String, String> tokenMap = parseTokenMap(data);
        if (tokenMap.isEmpty()) {
            return;
        }
        data.setMerchantName(apply(data.getMerchantName(), tokenMap));
        data.setRawText(apply(data.getRawText(), tokenMap));
        data.setLineItemsJson(rehydrateLineItemsJson(data.getLineItemsJson(), tokenMap));
    }

    /** Rehydrates description/payeeOrPayer in place, using the parent ExtractedData's token map. */
    public void rehydrate(BankTransaction txn, Map<String, String> tokenMap) {
        if (tokenMap.isEmpty()) {
            return;
        }
        txn.setDescription(apply(txn.getDescription(), tokenMap));
        txn.setPayeeOrPayer(apply(txn.getPayeeOrPayer(), tokenMap));
    }

    public Map<String, String> parseTokenMap(ExtractedData data) {
        String json = data.getPiiTokenMapJson();
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String rehydrateLineItemsJson(String lineItemsJson, Map<String, String> tokenMap) {
        if (lineItemsJson == null || lineItemsJson.isBlank()) {
            return lineItemsJson;
        }
        try {
            List<LineItem> items = objectMapper.readValue(lineItemsJson, new TypeReference<List<LineItem>>() {
            });
            List<LineItem> rehydrated = items.stream()
                    .map(item -> new LineItem(
                            apply(item.itemName(), tokenMap),
                            apply(item.description(), tokenMap),
                            item.sku(), item.quantity(), item.unitPrice(), item.totalPrice(),
                            item.categoryTag(), item.isTaxable(), item.categoryConfidence()))
                    .toList();
            return objectMapper.writeValueAsString(rehydrated);
        } catch (Exception e) {
            // Best-effort — a malformed blob is left as-is rather than
            // breaking the whole response over a field the reviewer can
            // still edit and re-save.
            return lineItemsJson;
        }
    }

    private String apply(String text, Map<String, String> tokenMap) {
        if (text == null || text.isBlank()) {
            return text;
        }
        String result = text;
        for (Map.Entry<String, String> entry : tokenMap.entrySet()) {
            result = result.replace(entry.getKey(), entry.getValue());
        }
        return result;
    }
}
