package Handler;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    /* 이미 존재하는 방 이름 */
    public static class RoomAlreadyExistsException extends RuntimeException {
        public RoomAlreadyExistsException(String message) {
            super(message);
        }
    }

    /* 존재하지 않는 로비 */
    public static class LobbyNotFoundException extends RuntimeException {
        public LobbyNotFoundException(String message) {
            super(message);
        }
    }

    @ExceptionHandler(RoomAlreadyExistsException.class)
    public ResponseEntity<String> handleRoomAlreadyExists(RoomAlreadyExistsException e) {
        return ResponseEntity
                .status(HttpStatus.CONFLICT) // 409
                .body(e.getMessage());
    }

    @ExceptionHandler(LobbyNotFoundException.class)
    public ResponseEntity<String> handleLobbyNotFound(LobbyNotFoundException e) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND) // 404
                .body(e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST) // 400
                .body(e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleException(Exception e) {
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR) // 500
                .body("서버 내부 오류가 발생했습니다.");
    }
}
