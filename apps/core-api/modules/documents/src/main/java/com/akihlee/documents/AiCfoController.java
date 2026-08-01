package com.akihlee.documents;

import com.akihlee.identity.TenantContext;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Placeholder for the AI CFO feature. No LLM is configured for this project
 * yet (no OPENAI_API_KEY/ANTHROPIC_API_KEY), so this doesn't have a real
 * conversation — it grounds a canned response in the tenant's actual
 * extracted data so the page isn't just a mockup. Swap the body of
 * buildReply() for a real LLM call once a key is available.
 */
@RestController
@RequestMapping("/api/v1/ai-cfo")
public class AiCfoController {

    private final ExtractedDataRepository extractedDataRepository;

    public AiCfoController(ExtractedDataRepository extractedDataRepository) {
        this.extractedDataRepository = extractedDataRepository;
    }

    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<ExtractedData> all = extractedDataRepository.findByTenantId(tenantId, Pageable.unpaged()).getContent();

        BigDecimal total = all.stream()
                .map(ExtractedData::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String currency = all.stream()
                .map(ExtractedData::getCurrency)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse("KES");

        String reply;
        if (all.isEmpty()) {
            reply = "AI CFO is still in development, so I can't give real predictions yet. "
                    + "Upload a few receipts from the Dashboard and I'll be able to summarize your spend here.";
        } else {
            reply = String.format(
                    "AI CFO is still in development, so I can't give real financial predictions yet. "
                            + "Here's what I can tell you from your data so far: %d processed document(s) totaling "
                            + "approximately %s %s. Once this feature is fully built, I'll be able to answer "
                            + "questions about cash flow, spending trends, and give recommendations.",
                    all.size(), currency, total);
        }
        return new ChatResponse(reply);
    }
}
