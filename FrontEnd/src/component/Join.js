/**
 * 파일명: Join.js
 * 설명: 웹소켓 방 목록 + 비밀번호(잠금) 기능 적용
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
    const [rooms, setRooms] = useState([]);
    const client = useRef(null);

    // 세션에서 닉네임 가져오기
    const nickname = sessionStorage.getItem("nickname") || "";

    useEffect(() => {
        // 1. 초기 방 목록 로드 (HTTP)
        fetchRoomList();

        // 2. 소켓 연결
        connectWebSocket();

        // 3. 언마운트 시 연결 해제
        return () => disconnectWebSocket();
    }, []);

    const fetchRoomList = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/lobbies`);
            setRooms(res.data);
        } catch (err) {
            console.error("방 목록 로드 실패:", err);
        }
    };

    const connectWebSocket = () => {
        client.current = new Client({
            webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
            reconnectDelay: 5000,
            onConnect: () => {
                console.log("🟢 Join 페이지 소켓 연결 성공");
                
                // 실시간 방 목록 구독
                client.current.subscribe('/topic/lobbies', (message) => {
                    const updatedRooms = JSON.parse(message.body);
                    setRooms(updatedRooms);
                });
            },
            onStompError: (frame) => {
                console.error("🔴 소켓 에러:", frame.headers['message']);
            }
        });
        client.current.activate();
    };

    const disconnectWebSocket = () => {
        if (client.current) {
            client.current.deactivate();
        }
    };

    // ✨ [핵심] 방 입장 핸들러 (비밀번호 체크 추가)
    const handleJoinRoom = async (room) => {
        if (!nickname.trim()) {
            alert("닉네임을 입력해 주세요.");
            return;
        }

        let inputPassword = null;

        // 1. 비밀번호 입력 받기
        if (room.passwordEnabled) {
            inputPassword = prompt("🔒 잠금된 방입니다. 비밀번호를 입력하세요:");
            if (inputPassword === null) return; // 취소 누르면 중단
        }

        try {
            // 🔥 [핵심] 입장하기 전에 비밀번호가 맞는지 서버에 물어봄!
            await axios.post(`${API_BASE_URL}/lobby/verify`, {
                roomId: room.id,
                password: inputPassword
            });

            // 2. 성공하면 닉네임 저장 후 이동
            sessionStorage.setItem("nickname", nickname);
            
            if (room.gameStarted) {
                navigate(`/gaming/${room.id}`);
            } else {
                navigate(`/lobby/${room.id}`, { 
                    state: { 
                        nickname, 
                        password: inputPassword // 비밀번호도 들고 감 (소켓 연결용)
                    } 
                });
            }

        } catch (error) {
            // 3. 실패하면 에러 메시지 띄우고 이동 안 함
            if (error.response && error.response.status === 401) {
                alert("🚫 비밀번호가 틀렸습니다!");
            } else {
                alert("방에 입장할 수 없습니다. (존재하지 않거나 오류 발생)");
            }
        }
    };

    return (
        <div className='join-wrapper'>
            {/* 뒤로가기 */}
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

            {/* 방 목록 */}
            <div className='room-list-box'>
                <div className='room-grid-container'>

                    {rooms.length === 0 && (
                        <div style={{ color: 'white', gridColumn: '1 / -1', textAlign: 'center' }}>
                            생성된 방이 없습니다.
                        </div>
                    )}

                    {rooms.map((room) => {
                        const current = room.currentCount || 0; 
                        const max = room.maxCount || 10; 
                        const ratio = max > 0 ? current / max : 0;
                        const isFull = current >= max;

                        return (
                            <div key={room.id} className='room-card' style={{ '--ratio': ratio }}>
                                <div className='room-card-top'>
                                    <div style={{ display: 'flex', alignItems: 'center', maxWidth: '75%'}}>
                                        <span className='room-name' title={room.name}>{room.name}</span>
                                        {/* 🔒 자물쇠 아이콘 표시 */}
                                        {room.passwordEnabled && (
                                            <span className="lock-icon" title="비밀번호 필요">🔒</span>
                                        )}
                                    </div>
                                    <span className={`room-status ${isFull ? 'full' : ''}`}>
                                        {current} / {max}
                                    </span>
                                </div>

                                <div className='room-card-middle'>
                                    <div className='owner-name'>방장: {room.hostNickname}</div>
                                    <div className='room-desc'>모드: {room.mode}</div>
                                </div>

                                <button
                                    className={`room-join-btn ${isFull ? 'disabled' : ''}`}
                                    disabled={isFull}
                                    onClick={() => handleJoinRoom(room)}
                                >
                                    {isFull 
                                        ? '만원' 
                                        : room.gameStarted ? '게임 참여' : '입장하기'}
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