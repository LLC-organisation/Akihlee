package com.akihlee.finance.aicfo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AiCfoMessageRepository extends JpaRepository<AiCfoMessage, UUID> {

    List<AiCfoMessage> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);
}
