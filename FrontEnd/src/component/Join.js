/**
 * 파일명: Join.js
 * 설명: 웹소켓(STOMP)을 통해 실시간 방 목록(인원수 포함)을 동기화
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

import '../layout/Fragment.css';
import './Join.css';
import { API_BASE_URL } from "../api/config";

function Join() {
    const navigate = useNavigate();
    const [rooms, setRooms] = useState([]); // 방 목록
    const client = useRef(null);            // 웹소켓 클라이언트

    // 닉네임 확인
    const nickname = sessionStorage.getItem("nickname") || "";

    useEffect(() => {
        // 1. 최초 1회 HTTP로 목록 로딩 (빠른 화면 표시용)
        fetchRoomList();

        // 2. 웹소켓 연결 시작
        connectWebSocket();

        // 3. 페이지 나갈 때 연결 끊기
        return () => disconnectWebSocket();
    }, []);

    /* ------------------------------------------------
       기능 1: HTTP로 초기 목록 가져오기
    ------------------------------------------------ */
    const fetchRoomList = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/lobbies`);
            // 백엔드 DTO에 currentCount가 없으면 0으로 처리됨
            setRooms(res.data);
        } catch (error) {
            console.error("방 목록 로드 실패:", error);
        }
    };

    /* ------------------------------------------------
       기능 2: 웹소켓(STOMP) 연결 및 구독
    ------------------------------------------------ */
    const connectWebSocket = () => {
        // 소켓 연결 설정
        client.current = new Client({
            // 백엔드 WebSocketConfig에 설정된 엔드포인트 (보통 /ws-stomp)
            webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
            reconnectDelay: 5000,
            
            onConnect: () => {
                console.log("🟢 Join 페이지 소켓 연결 성공");

                // [구독] 서버가 '/topic/lobbies'로 새 리스트를 주면 화면 갱신
                client.current.subscribe('/topic/lobbies', (message) => {
                    const updatedRooms = JSON.parse(message.body);
                    console.log("🔄 실시간 방 목록 갱신됨:", updatedRooms);
                    setRooms(updatedRooms);
                });
            },
            onStompError: (frame) => {
                console.error("🔴 소켓 에러:", frame.headers['message']);
            },
        });

        client.current.activate();
    };

    const disconnectWebSocket = () => {
        if (client.current) {
            client.current.deactivate();
        }
    };

    /* ------------------------------------------------
       기능 3: 방 입장 핸들러
    ------------------------------------------------ */
    const handleJoinRoom = (room) => {
        if (!nickname.trim()) {
            alert("닉네임을 입력해 주세요.");
            return;
        }
        
        sessionStorage.setItem("nickname", nickname);

        // 게임 시작 여부에 따라 분기
        if (room.gameStarted) {
            navigate(`/gaming/${room.id}`);
        } else {
            navigate(`/lobby/${room.id}`, { state: { nickname } });
        }
    };

    return (
        <div className='join-wrapper'>
            {/* 상단 뒤로가기 */}
            <button className='back-btn-top' onClick={() => navigate("/")}>
                &lt; 뒤로가기
            </button>

            {/* 헤더 */}
            <div className='join-header-container'>
                <div className='logo-area'>
                    <img src='/img/logo.png' className='join-logo' alt='draw-it!' />
                </div>
                <div className='title-area'>
                    <div className='join-title'>참여할 방을 선택하세요!</div>
                </div>
            </div>

            {/* 방 목록 카드 영역 */}
            <div className='room-list-box'>
                <div className='room-grid-container'>
                    
                    {rooms.length === 0 && (
                        <div style={{ color: 'white', gridColumn: '1 / -1', textAlign: 'center' }}>
                            생성된 방이 없습니다.
                        </div>
                    )}

                    {rooms.map((room) => {
                        // 백엔드 DTO 필드명에 맞춰야 함 (currentCount 권장)
                        const current = room.currentCount || 0; 
                        const max = room.maxCount || 10; 
                        const ratio = max > 0 ? current / max : 0;
                        const isFull = current >= max;

                        return (
                            <div 
                                key={room.id} 
                                className='room-card' 
                                style={{ '--ratio': ratio }}
                            >
                                {/* 상단: 이름 + 인원수 */}
                                <div className='room-card-top'>
                                    <span className='room-name'>{room.name}</span>
                                    <span className={`room-status ${isFull ? 'full' : ''}`}>
                                        {current} / {max}
                                    </span>
                                </div>

                                {/* 중단: 방장 + 모드 */}
                                <div className='room-card-middle'>
                                    <div className='owner-name'>방장: {room.hostNickname}</div>
                                    <div className='room-desc'>모드: {room.mode}</div>
                                </div>

                                {/* 하단: 입장 버튼 */}
                                <button
                                    className={`room-join-btn ${isFull ? 'disabled' : ''}`}
                                    disabled={isFull}
                                    onClick={() => handleJoinRoom(room)}
                                >
                                    {isFull 
                                        ? '만원' 
                                        : room.gameStarted ? '게임 참여' : '대기실 입장'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default Join;