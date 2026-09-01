package com.akihlee.qbquickstart.web;

import com.akihlee.qbquickstart.oauth.IntuitApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    /** Intuit rejected a request — pass its status and raw body straight through, see IntuitApiException. */
    @ExceptionHandler(IntuitApiException.class)
    public ResponseEntity<Map<String, Object>> handleIntuit(IntuitApiException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "intuit_api_error");
        body.put("intuitStatusCode", e.getStatusCode());
        body.put("intuitResponseBody", e.getResponseBody());
        HttpStatus status = HttpStatus.resolve(e.getStatusCode());
        return ResponseEntity.status(status != null ? status : HttpStatus.BAD_GATEWAY).body(body);
    }

    /** Not connected yet, missing client secret, corrupt token file, etc. — our own precondition failures. */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
    }
}
