/**
 * 파일명: Join.js
 * 설명: 게임 대기실 목록을 보여주는 페이지
 * 기능:
 * - 방 목록 표시 (카드 형태)
 * - 인원수에 따른 실시간 색상 변화 시각화
 * - 만원 방 입장 제한 처리
 * - 뒤로가기 및 입장 기능
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../layout/Fragment.css'; // 공통 레이아웃 스타일
import './Join.css';           // 현재 페이지 전용 스타일

function Join() {
    // 훅 초기화 진행
    const navigate = useNavigate();

    // room.js 이동경로 지정
    const handleJoinRoom = (roomId) => {
            navigate(`/room/${roomId}`);
    };
    

    // [TODO] 백엔드 연동 전 UI 테스트를 위한 더미 데이터
    // 추후 axios/fetch를 통해 Spring Boot API에서 받아올 예정
    const dummyRooms = [
        { id: 1, title: '캐치마인드 고수만', owner: 'User01', current: 1, max: 10, desc: '즐거운 게임 하실분~' },
        { id: 2, title: '그림 못 그려도 OK', owner: 'Picasso', current: 3, max: 10, desc: '재미로만 합니다 ㅋㅋ' },
        { id: 3, title: '새벽반 모여라', owner: 'Newbie', current: 5, max: 10, desc: '잠 안오는 사람들' },
        { id: 4, title: '스피드 퀴즈방', owner: 'Master', current: 7, max: 10, desc: '빨리 맞추기 게임' },
        { id: 5, title: '아무나 들어와', owner: 'King', current: 9, max: 10, desc: '심심해요' },
        { id: 6, title: '풀방 테스트', owner: 'Admin', current: 10, max: 10, desc: '꽉 찬 방입니다' },
    ];

    return (
        <div className='join-wrapper'>
            {/* 1. 상단 네비게이션 영역 */}
            {/* 뒤로가기 버튼: 왼쪽 상단 고정 */}
            <button className='back-btn-top' onClick={() => navigate(-1)}>
                &lt; 뒤로가기
            </button>

            {/* 2. 헤더 영역 */}
            {/* 로고와 타이틀을 감싸는 컨테이너 (Flex-column으로 세로 정렬) */}
            <div className='join-header-container'>
                <div className='logo-area'>
                    <img src='/img/logo.png' className='join-logo' alt='draw-it!' />
                </div>
                <div className='title-area'>
                    <div className='join-title'>참여할 방을 선택하세요!</div>
                </div>
            </div>

            {/* 3. 방 목록 영역 */}
            {/* 반투명 유리 효과 박스 */}
            <div className='room-list-box'>
                <div className='room-grid-container'>
                    {dummyRooms.map((room) => {
                        // (1) 인원 비율 계산 (0 ~ 1 사이 실수) -> CSS 변수(--ratio)로 전달
                        const ratio = room.current / room.max;
                        // (2) 방 만원 여부 체크
                        const isFull = room.current >= room.max;

                        return (
                            <div 
                                key={room.id} 
                                className='room-card'
                                style={{ '--ratio': ratio }} // CSS의 calc() 함수에서 사용됨
                            >
                                {/* 카드 상단: 방 제목 및 인원수 */}
                                <div className='room-card-top'>
                                    <span className='room-name'>{room.title}</span>
                                    {/* 만원일 경우 'full' 클래스 추가하여 빨간 글씨 처리 */}
                                    <span className={`room-status ${isFull ? 'full' : ''}`}>
                                        {room.current} / {room.max}
                                    </span>
                                </div>
                                
                                {/* 카드 중단: 방장 및 설명 */}
                                <div className='room-card-middle'>
                                    <div className='owner-name'>방장: {room.owner}</div>
                                    <div className='room-desc'>{room.desc}</div>
                                </div>

                                {/* 카드 하단: 입장 버튼 */}
                                <button 
                                    className={`room-join-btn ${isFull ? 'disabled' : ''}`} 
                                    disabled={isFull} // HTML 버튼 비활성화 속성
                                    onClick={() => handleJoinRoom(room.id)} // room.js로 이동
                                >
                                    {isFull ? '만원' : '입장하기'}
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