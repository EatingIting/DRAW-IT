/**
 * 파일명: Join.js
 * 설명: 게임 대기실 목록을 보여주는 페이지
 * 기능:
 * - 방 목록 표시 (카드 형태)
 * - 게임 진행 여부에 따라 Lobby / Game 자동 분기
 * - 만원 방 입장 제한 처리
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../layout/Fragment.css';
import './Join.css';
import { API_BASE_URL } from "../api/config";

function Join() {
    const navigate = useNavigate();

    // 방 목록
    const [rooms, setRooms] = useState([]);

    // 닉네임 (Lobby / Game 공통 사용)
    const [nickname, setNickname] = useState(
        sessionStorage.getItem("nickname") || ""
    );

    /* =========================
       방 목록 불러오기
    ========================= */
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/lobbies`)
            .then((response) => {
                console.log("서버에서 받은 방 목록:", response.data);
                setRooms(response.data);
            })
            .catch((error) => {
                console.error("방 목록을 불러오지 못했습니다", error);
            });
    }, []);

    /* =========================
       방 입장 처리 (핵심 로직)
    ========================= */
    const handleJoinRoom = (room) => {
        if (!nickname.trim()) {
            alert("닉네임을 입력해 주세요.");
            return;
        }

        // 닉네임 저장 (Lobby / Game 공통)
        sessionStorage.setItem("nickname", nickname);

        // ✅ 게임이 이미 시작된 방 → 바로 GameScreen
        if (room.gameStarted) {
            navigate(`/gaming/${room.id}`);
            return;
        }

        // ❌ 아직 게임 전 → LobbyScreen
        navigate(`/lobby/${room.id}`, {
            state: { nickname }
        });
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

            {/* 방 목록 */}
            <div className='room-list-box'>
                <div className='room-grid-container'>

                    {rooms.length === 0 && (
                        <div
                            style={{
                                color: 'white',
                                gridColumn: '1 / -1',
                                textAlign: 'center'
                            }}
                        >
                            생성된 방이 없습니다.
                        </div>
                    )}

                    {rooms.map((room) => {
                        // UI 보정용 값
                        const current = 1; // TODO: 유저 수 연동
                        const max = 10;
                        const ratio = current / max;
                        const isFull = current >= max;

                        return (
                            <div
                                key={room.id}
                                className='room-card'
                                style={{ '--ratio': ratio }}
                            >
                                {/* 상단 */}
                                <div className='room-card-top'>
                                    <span className='room-name'>{room.name}</span>
                                    <span className={`room-status ${isFull ? 'full' : ''}`}>
                                        {current} / {max}
                                    </span>
                                </div>

                                {/* 중단 */}
                                <div className='room-card-middle'>
                                    <div className='owner-name'>
                                        방장: {room.hostNickname}
                                    </div>
                                    <div className='room-desc'>
                                        모드: {room.mode}
                                    </div>
                                </div>

                                {/* 하단 */}
                                <button
                                    className={`room-join-btn ${isFull ? 'disabled' : ''}`}
                                    disabled={isFull}
                                    onClick={() => handleJoinRoom(room)}
                                >
                                    {isFull
                                        ? '만원'
                                        : room.gameStarted
                                            ? '게임 참여'
                                            : '대기실 입장'}
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
