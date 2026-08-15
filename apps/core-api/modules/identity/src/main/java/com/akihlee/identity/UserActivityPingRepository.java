package com.akihlee.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface UserActivityPingRepository extends JpaRepository<UserActivityPing, UUID> {

    @Query("SELECT p.createdAt FROM UserActivityPing p WHERE p.userId = :userId ORDER BY p.createdAt ASC")
    List<Instant> findTimestampsForUser(@Param("userId") UUID userId);

    /** Ordered by user then time, so session-bucketing (see UserActivityService) can walk each user's run in one pass. */
    @Query("SELECT p.userId as userId, p.createdAt as createdAt FROM UserActivityPing p " +
           "WHERE p.userId IN :userIds ORDER BY p.userId, p.createdAt ASC")
    List<PingRow> findTimestampsForUsers(@Param("userIds") List<UUID> userIds);

    interface PingRow {
        UUID getUserId();
        Instant getCreatedAt();
    }
}
