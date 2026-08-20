package com.akihlee.finance.aicfo;

import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantRepository;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Pageable;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class AiCfoConversationRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private AiCfoConversationRepository conversationRepository;

    @Autowired
    private AiCfoMessageRepository messageRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private UserRepository userRepository;

    private Tenant tenant;
    private User userA;
    private User userB;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(new Tenant("Café Mocha"));
        userA = userRepository.save(new User(tenant.getId(), "a@cafe-mocha.test", "hash"));
        userB = userRepository.save(new User(tenant.getId(), "b@cafe-mocha.test", "hash"));
    }

    @Test
    void findByUserId_isScopedToOneUser_notTheWholeTenant() {
        conversationRepository.save(new AiCfoConversation(tenant.getId(), userA.getId(), "User A's chat"));
        conversationRepository.save(new AiCfoConversation(tenant.getId(), userB.getId(), "User B's chat"));

        List<AiCfoConversation> userAConversations =
                conversationRepository.findByUserIdOrderByUpdatedAtDesc(userA.getId(), Pageable.unpaged());

        assertThat(userAConversations).hasSize(1);
        assertThat(userAConversations.get(0).getTitle()).isEqualTo("User A's chat");
    }

    @Test
    void findByUserId_ordersByMostRecentlyUpdatedFirst() {
        AiCfoConversation older = conversationRepository.save(new AiCfoConversation(tenant.getId(), userA.getId(), "Older"));
        AiCfoConversation newer = conversationRepository.save(new AiCfoConversation(tenant.getId(), userA.getId(), "Newer"));
        newer.touch();
        conversationRepository.save(newer);
        older.touch(); // touched after newer's touch(), so this one should now sort first
        conversationRepository.save(older);

        List<AiCfoConversation> result = conversationRepository.findByUserIdOrderByUpdatedAtDesc(userA.getId(), Pageable.unpaged());

        assertThat(result.get(0).getTitle()).isEqualTo("Older");
    }

    @Test
    void findByIdAndUserId_returnsEmpty_whenConversationBelongsToAnotherUser() {
        AiCfoConversation conversation = conversationRepository.save(
                new AiCfoConversation(tenant.getId(), userA.getId(), "User A's chat"));

        assertThat(conversationRepository.findByIdAndUserId(conversation.getId(), userB.getId())).isEmpty();
        assertThat(conversationRepository.findByIdAndUserId(conversation.getId(), userA.getId())).isPresent();
    }

    @Test
    void messages_areOrderedByCreatedAtAscending() {
        AiCfoConversation conversation = conversationRepository.save(
                new AiCfoConversation(tenant.getId(), userA.getId(), "Chat"));
        messageRepository.save(new AiCfoMessage(conversation.getId(), MessageRole.USER, "first"));
        messageRepository.save(new AiCfoMessage(conversation.getId(), MessageRole.ASSISTANT, "second"));
        messageRepository.save(new AiCfoMessage(conversation.getId(), MessageRole.USER, "third"));

        List<AiCfoMessage> messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.getId());

        assertThat(messages).extracting(AiCfoMessage::getContent).containsExactly("first", "second", "third");
    }

    @Test
    void messages_areNotMixedAcrossConversations() {
        AiCfoConversation conversationOne = conversationRepository.save(
                new AiCfoConversation(tenant.getId(), userA.getId(), "Chat 1"));
        AiCfoConversation conversationTwo = conversationRepository.save(
                new AiCfoConversation(tenant.getId(), userA.getId(), "Chat 2"));
        messageRepository.save(new AiCfoMessage(conversationOne.getId(), MessageRole.USER, "in chat 1"));
        messageRepository.save(new AiCfoMessage(conversationTwo.getId(), MessageRole.USER, "in chat 2"));

        List<AiCfoMessage> chatOneMessages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationOne.getId());

        assertThat(chatOneMessages).hasSize(1);
        assertThat(chatOneMessages.get(0).getContent()).isEqualTo("in chat 1");
    }
}
