package com.akihlee.finance.aicfo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AiCfoConversationRepository extends JpaRepository<AiCfoConversation, UUID> {

    List<AiCfoConversation> findByUserIdOrderByUpdatedAtDesc(UUID userId, Pageable pageable);

    Optional<AiCfoConversation> findByIdAndUserId(UUID id, UUID userId);
}
