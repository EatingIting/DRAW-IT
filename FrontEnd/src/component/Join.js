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
import PasswordModal from './PasswordModal';
import AlertModal from './AlertModal';

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

    // 모달
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [targetRoom, setTargetRoom] = useState(null);
    const [alertMessage, setAlertMessage] = useState(null);

    //페이지네이션 추가 (6개 단위)
    const [currentPage, setCurrentPage] = useState(1); // 현재 페이지
    const roomsPerPage = 6; // 한 페이지에 보여줄 방 개수

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

    // 유효한 방만 걸러냄
    const filterValidRooms = (roomList) => {
        if (!Array.isArray(roomList)) return [];
        return roomList.filter(room => {

    
        // 1. [추가됨] 대기중이든 뭐든, 사람이 0명이면 무조건 삭제!
            if (room.currentCount <= 0) {
                return false;
            }

            // 2. [팀원 코드 유지] 게임 중인데 사람이 2명 미만이면 삭제 (비정상 종료)
            if (room.gameStarted && room.currentCount < 2) {
                return false;
            }
            
            return true; // 통과된 정상 방들만 표시
        });
    };

    // 📡 [HTTP] 방 목록 가져오기 (초기 로딩용)
    const fetchRoomList = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/lobbies`);

            // ✅ 받아온 데이터를 필터링 후 상태 저장
            const validRooms = filterValidRooms(res.data);

            // 시간 데이터값을 오른차순으로 정렬
            validRooms.sort((a, b) => {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                
                if (!dateA) return 1;
                if (!dateB) return -1;

                return dateA - dateB; // 👈 여기가 포인트! (작은 날짜가 먼저)
            })
            
            console.log("🔥 [확인] 필터링된 방 목록:", validRooms);
            setRooms(validRooms);

            console.log("📦 [HTTP] 방 목록 로드 완료:", validRooms.length + "개");
        } catch (err) {
            console.error("❌ [HTTP] 방 목록 로드 실패:", err);
        }
    };

    // [WebSocket] 소켓 연결 및 구독
    const connectWebSocket = () => {
        client.current = new Client({
            webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
            reconnectDelay: 5000, 
            onConnect: () => {
                console.log("🟢 [WS] 소켓 연결 성공!");
                
                client.current.subscribe('/topic/lobbies', (message) => {
                    const updatedRoomsRaw = JSON.parse(message.body);
                    // 소켓으로 온 데이터도 필터링 적용!
                    const validRooms = filterValidRooms(updatedRoomsRaw);

                    setRooms(validRooms);
                    
                    console.groupCollapsed(`🔄 [WS] 방 목록 갱신됨 (${new Date().toLocaleTimeString()})`);
                    console.table(validRooms.map(r => ({
                        제목: r.name,
                        인원: `${r.currentCount}/${r.maxCount}`,
                        상태: r.gameStarted ? '게임중' : '대기중',
                        잠금: r.passwordEnabled ? 'ON' : 'OFF'
                    })));

                    // 시간 데이터값을 오름차순으로 정렬
                    validRooms.sort((a, b) => {
                        const dateA = new Date(a.createdAt).getTime();
                        const dateB = new Date(b.createdAt).getTime();
                        
                        if (!dateA) return 1;
                        if (!dateB) return -1;

                        return dateA - dateB; // 👈 작은 날짜가 먼저
                    });

                    console.groupEnd();
                });
            },
            onStompError: (frame) => {
                console.error("🔴 [WS] 소켓 에러 발생:", frame.headers['message']);
            }
        });
        client.current.activate();
    };

    // 비밀번호 틀릴 시 함수
    const showAlert = (msg) => {
        setAlertMessage(msg); // 메시지를 설정하면 모달이 열림
    };

    const closeAlert = () => {
        setAlertMessage(null); // 메시지를 지우면 모달이 닫힘
    };

    // 현재 페이지에 보여줄 방 계산하기
    const indexOfLastRoom = currentPage * roomsPerPage; // 예: 1페이지면 6, 2페이지면 12
    const indexOfFirstRoom = indexOfLastRoom - roomsPerPage; // 예: 1페이지면 0, 2페이지면 6
    const currentRooms = rooms.slice(indexOfFirstRoom, indexOfLastRoom); // 0~6번방, 6~12번방 자르기
    const totalPages = Math.ceil(rooms.length / roomsPerPage); // 전체 페이지 수 계산

    // 페이지 방 이동 함수
    const handleNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const handlePrevPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    // 🚪 [Handler] 방 입장 처리 로직
    const handleJoinRoom = async (room) => {
        // 1. 닉네임 체크
        if (!nickname.trim()) {
            showAlert("닉네임을 먼저 설정해 주세요.");
            return;
        }

        // 2. 비밀번호 체크 (잠금 방일 경우)
        if (room.passwordEnabled) {
            setTargetRoom(room); // 입장하려는 방 저장
            setIsPasswordModalOpen(true); // 모달 열기
        } else {
            verifyAndJoin(room, null); // 비밀번호 없으면 바로 입장
        }

    };

    // 모달에서 비밀번호 입력 후 확인 눌렀을 때
    const handlePasswordSubmit = (password) => {
        setIsPasswordModalOpen(false); // 모달 닫기
        if(targetRoom) {
            verifyAndJoin(targetRoom, password) // 검증 요청
        }
    };

    // 실제 서버 검증 및 입장 로직
    const verifyAndJoin = async (room, password) => {
        try {
            // 3. 서버에 입장 가능 여부 확인 (비밀번호 검증)
            console.log(`🔍 [Join] 방 입장 시도: ${room.name} (ID: ${room.id})`);
            
            await axios.post(`${API_BASE_URL}/lobby/verify`, {
                roomId: room.id,
                password: password
            });

            // 4. 검증 성공 시 이동 처리
            sessionStorage.setItem("nickname", nickname);
            
            const targetPath = room.gameStarted 
                ? `/gaming/${room.id}`  // 게임 중이면 관전/난입
                : `/lobby/${room.id}`;  // 대기 중이면 로비

            navigate(targetPath, { 
                state: { 
                    nickname, 
                    password: password // 소켓 연결 시 인증용
                } 
            });

        } catch (error) {
            // 5. 에러 처리
            console.error("❌ [Join] 입장 실패:", error);
            if (error.response && error.response.status === 401) {
                showAlert("🚫 비밀번호가 일치하지 않습니다.");
            } else if (error.response && error.response.status === 404) {
                showAlert("존재하지 않는 방입니다");
            } else {
                showAlert("입장할 수 없습니다");
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
                    {currentRooms.map((room) => (
                        <RoomCard 
                            key={room.id} 
                            room={room} 
                            onJoin={handleJoinRoom} 
                        />
                    ))}
                </div>

                {/* 페이지네이션 컨트롤 (방이 있을 때만 표시) */}
                {rooms.length > 0 && (
                    <div className="pagination-box">
                        <button 
                            className="page-btn prev" 
                            onClick={handlePrevPage} 
                            disabled={currentPage === 1}
                        >
                            ◀
                        </button>
                        
                        <span className="page-info">
                            {currentPage} / {totalPages === 0 ? 1 : totalPages}
                        </span>
                        
                        <button 
                            className="page-btn next" 
                            onClick={handleNextPage} 
                            disabled={currentPage === totalPages}
                        >
                            ▶
                        </button>
                    </div>
                )}
            </div>

            {/* 비밀번호 입력 모달 */}
            <PasswordModal
                isOpen={isPasswordModalOpen}
                close={() => setIsPasswordModalOpen(false)}
                submit={handlePasswordSubmit}
                roomName={targetRoom?.name}
            />

            {/* 비밀번호 틀릴 시 모달 추가 */}
            <AlertModal 
                isOpen={!!alertMessage} // 메시지가 있으면 true(열림)
                message={alertMessage}
                onClose={closeAlert}
            />
        </div>
    );
}

export default Join;