/**
 * 파일명: Join.js
 * 설명: 대기실 목록 조회 및 입장 처리 (WebSocket + HTTP)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

import '../layout/Fragment.css';
import './Join.css';
import { API_BASE_URL } from "../api/config";

// ✅ [컴포넌트] 방 목록의 각 카드를 담당 (코드를 분리하여 가독성 향상)
const RoomCard = ({ room, onJoin }) => {
    // 1. 인원수 비율 및 상태 계산
    const current = room.currentCount || 0;
    const max = room.maxCount || 10;
    const ratio = max > 0 ? current / max : 0;
    const isFull = current >= max;
    const isPlaying = room.gameStarted; // 백엔드에서 받은 게임 상태

    return (
        // CSS 변수(--ratio)를 통해 배경색 자동 조절 (초록 -> 빨강)
        <div className='room-card' style={{ '--ratio': ratio }}>
            
            {/* --- 카드 상단: 제목, 자물쇠, 상태뱃지, 인원 --- */}
            <div className='room-card-top'>
                {/* 제목 영역 (말줄임표 적용됨) */}
                <div className="card-header-left">
                    <span className='room-name' title={room.name}>{room.name}</span>
                    {room.passwordEnabled && <span className="lock-icon" title="비밀번호 필요">🔒</span>}
                </div>

                {/* 상태 뱃지 및 인원수 */}
                <div className="card-header-right">
                    <span className={`state-badge ${isPlaying ? 'playing' : 'waiting'}`}>
                        {isPlaying ? '🔥 게임중' : '⏳ 대기중'}
                    </span>
                    <span className={`room-status ${isFull ? 'full' : ''}`}>
                        {current} / {max}
                    </span>
                </div>
            </div>

            {/* --- 카드 중단: 방장, 모드 정보 --- */}
            <div className='room-card-middle'>
                <div className='owner-name'>👑 방장: {room.hostNickname}</div>
                <div className='room-desc'>🎮 모드: {room.mode}</div>
            </div>

            {/* --- 카드 하단: 입장 버튼 --- */}
            <button
                className={`room-join-btn ${isFull ? 'disabled' : ''}`}
                disabled={isFull}
                onClick={() => onJoin(room)}
            >
                {isFull ? '⛔ 만원' : isPlaying ? '👀 관전하기' : '🚀 입장하기'}
            </button>
        </div>
    );
};


// ✅ [메인] Join 페이지 컴포넌트
function Join() {
    const navigate = useNavigate();
    const [rooms, setRooms] = useState([]); // 방 목록 상태 관리
    const client = useRef(null);            // 소켓 클라이언트 참조

    const nickname = sessionStorage.getItem("nickname") || "";

    // 🔄 [Effect] 초기 로드 및 소켓 연결
    useEffect(() => {
        console.group("🚀 [Join Page] 초기화 시작");
        fetchRoomList();      // 1. HTTP로 목록 한 번 가져오기
        connectWebSocket();   // 2. 소켓 연결하여 실시간 갱신

        // cleanup: 페이지 나갈 때 연결 끊기
        return () => {
            console.log("👋 [Join Page] 소켓 연결 해제");
            if (client.current) client.current.deactivate();
            console.groupEnd();
        };
    }, []);

    // 📡 [HTTP] 방 목록 가져오기 (초기 로딩용)
    const fetchRoomList = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/lobbies`);
            setRooms(res.data);
            console.log("📦 [HTTP] 방 목록 로드 완료:", res.data.length + "개");
        } catch (err) {
            console.error("❌ [HTTP] 방 목록 로드 실패:", err);
        }
    };

    // 🔌 [WebSocket] 소켓 연결 및 구독
    const connectWebSocket = () => {
        client.current = new Client({
            webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
            reconnectDelay: 5000, // 끊기면 5초 뒤 재연결 시도
            
            onConnect: () => {
                console.log("🟢 [WS] 소켓 연결 성공!");
                
                // 실시간 방 목록 구독
                client.current.subscribe('/topic/lobbies', (message) => {
                    const updatedRooms = JSON.parse(message.body);
                    setRooms(updatedRooms);
                    
                    // 🔍 개발자 도구에서 표 형태로 깔끔하게 확인 가능
                    console.groupCollapsed(`🔄 [WS] 방 목록 갱신됨 (${new Date().toLocaleTimeString()})`);
                    console.table(updatedRooms.map(r => ({
                        제목: r.name,
                        인원: `${r.currentCount}/${r.maxCount}`,
                        상태: r.gameStarted ? '게임중' : '대기중',
                        잠금: r.passwordEnabled ? 'ON' : 'OFF'
                    })));
                    console.groupEnd();
                });
            },
            onStompError: (frame) => {
                console.error("🔴 [WS] 소켓 에러 발생:", frame.headers['message']);
            }
        });
        client.current.activate();
    };

    // 🚪 [Handler] 방 입장 처리 로직
    const handleJoinRoom = async (room) => {
        // 1. 닉네임 체크
        if (!nickname.trim()) {
            alert("닉네임을 먼저 설정해 주세요.");
            return;
        }

        let inputPassword = null;

        // 2. 비밀번호 체크 (잠금 방일 경우)
        if (room.passwordEnabled) {
            inputPassword = prompt("🔒 잠금된 방입니다. 비밀번호를 입력하세요:");
            if (inputPassword === null) return; // 취소 버튼 누름
        }

        try {
            // 3. 서버에 입장 가능 여부 확인 (비밀번호 검증)
            console.log(`🔍 [Join] 방 입장 시도: ${room.name} (ID: ${room.id})`);
            
            await axios.post(`${API_BASE_URL}/lobby/verify`, {
                roomId: room.id,
                password: inputPassword
            });

            // 4. 검증 성공 시 이동 처리
            sessionStorage.setItem("nickname", nickname);
            
            const targetPath = room.gameStarted 
                ? `/gaming/${room.id}`  // 게임 중이면 관전/난입
                : `/lobby/${room.id}`;  // 대기 중이면 로비

            navigate(targetPath, { 
                state: { 
                    nickname, 
                    password: inputPassword // 소켓 연결 시 인증용
                } 
            });

        } catch (error) {
            // 5. 에러 처리
            console.error("❌ [Join] 입장 실패:", error);
            if (error.response && error.response.status === 401) {
                alert("🚫 비밀번호가 일치하지 않습니다.");
            } else {
                alert("입장할 수 없는 방입니다. (존재하지 않거나 서버 오류)");
            }
        }
    };

    return (
        <div className='join-wrapper'>
            {/* --- 뒤로가기 버튼 --- */}
            <button className="back-btn" onClick={() => navigate("/")}>
                <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>

            {/* --- 상단 헤더 영역 --- */}
            <div className='join-header-container'>
                <div className='logo-area'>
                    <img src='/img/logo.png' className='join-logo' alt='draw-it!' />
                </div>
                <div className='title-area'>
                    <div className='join-title'>참여할 방을 선택하세요!</div>
                </div>
            </div>

            {/* --- 방 목록 그리드 영역 --- */}
            <div className='room-list-box'>
                <div className='room-grid-container'>
                    
                    {/* 방이 하나도 없을 때 표시 */}
                    {rooms.length === 0 && (
                        <div className="empty-message">
                            현재 생성된 방이 없습니다. 새로운 방을 만들어보세요!
                        </div>
                    )}

                    {/* 방 카드 리스트 렌더링 (분리한 컴포넌트 사용) */}
                    {rooms.map((room) => (
                        <RoomCard 
                            key={room.id} 
                            room={room} 
                            onJoin={handleJoinRoom} 
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Join;