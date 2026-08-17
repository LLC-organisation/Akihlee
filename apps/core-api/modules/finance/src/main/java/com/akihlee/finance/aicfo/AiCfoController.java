package com.akihlee.finance.aicfo;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ai-cfo")
public class AiCfoController {

    private final AiCfoService aiCfoService;

    public AiCfoController(AiCfoService aiCfoService) {
        this.aiCfoService = aiCfoService;
    }

    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        return aiCfoService.chat(request.message(), request.history());
    }
}
