#!/bin/bash
# Test script for BFIS Chat Interface
# Tests all chat endpoints via curl

BASE_URL="${BFIS_CHAT_URL:-http://localhost:4513}"
SESSION_ID="test-session-$(date +%s)"

echo "=========================================="
echo "BFIS Chat Interface Test Script"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Session ID: $SESSION_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "GET $BASE_URL/bfis/health"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/bfis/health")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
else
    echo -e "${RED}✗ Health check failed (HTTP $http_code)${NC}"
    echo "$body"
    echo ""
    echo "Service may not be running. Start it with:"
    echo "  cd bfis-service && docker-compose --profile dev up bfis-service-dev"
    exit 1
fi
echo ""

# Test 2: Send a simple message
echo -e "${YELLOW}Test 2: Send Message${NC}"
echo "POST $BASE_URL/bfis/chat/message"
echo "Message: 'Hello, what can you help me with?'"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST "$BASE_URL/bfis/chat/message" \
    -H "Content-Type: application/json" \
    -d "{
        \"message\": \"Hello, what can you help me with?\",
        \"sessionId\": \"$SESSION_ID\"
    }")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Message sent successfully${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
    
    # Extract decisionId if present
    DECISION_ID=$(echo "$body" | jq -r '.decisionId // empty' 2>/dev/null)
    if [ -n "$DECISION_ID" ] && [ "$DECISION_ID" != "null" ]; then
        echo ""
        echo -e "${YELLOW}Action proposal detected! Decision ID: $DECISION_ID${NC}"
    fi
else
    echo -e "${RED}✗ Message send failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Test 3: Get conversation history
echo -e "${YELLOW}Test 3: Get Conversation History${NC}"
echo "GET $BASE_URL/bfis/chat/history?sessionId=$SESSION_ID"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    "$BASE_URL/bfis/chat/history?sessionId=$SESSION_ID")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ History retrieved successfully${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
else
    echo -e "${RED}✗ History retrieval failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Test 4: Ask about battlefield (should trigger Intel tool)
echo -e "${YELLOW}Test 4: Query Battlefield Intelligence${NC}"
echo "POST $BASE_URL/bfis/chat/message"
echo "Message: 'What is the current battlefield situation?'"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST "$BASE_URL/bfis/chat/message" \
    -H "Content-Type: application/json" \
    -d "{
        \"message\": \"What is the current battlefield situation?\",
        \"sessionId\": \"$SESSION_ID\"
    }")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Battlefield query sent successfully${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
else
    echo -e "${RED}✗ Battlefield query failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Test 5: Request an action (should propose actions)
echo -e "${YELLOW}Test 5: Request Action${NC}"
echo "POST $BASE_URL/bfis/chat/message"
echo "Message: 'Spawn 2 F-16s at coordinates 40.0, -75.0'"
response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST "$BASE_URL/bfis/chat/message" \
    -H "Content-Type: application/json" \
    -d "{
        \"message\": \"Spawn 2 F-16s at coordinates 40.0, -75.0\",
        \"sessionId\": \"$SESSION_ID\"
    }")
http_code=$(echo "$response" | grep "HTTP_CODE" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_CODE/d')

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Action request sent successfully${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
    
    # Extract decisionId if present
    DECISION_ID=$(echo "$body" | jq -r '.decisionId // empty' 2>/dev/null)
    if [ -n "$DECISION_ID" ] && [ "$DECISION_ID" != "null" ]; then
        echo ""
        echo -e "${YELLOW}Action proposal detected! Decision ID: $DECISION_ID${NC}"
        echo ""
        echo -e "${YELLOW}Test 6: Approve Action${NC}"
        echo "POST $BASE_URL/bfis/chat/approve"
        echo "Approving decision: $DECISION_ID"
        approve_response=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
            -X POST "$BASE_URL/bfis/chat/approve" \
            -H "Content-Type: application/json" \
            -d "{
                \"sessionId\": \"$SESSION_ID\",
                \"decisionId\": \"$DECISION_ID\",
                \"approved\": true
            }")
        approve_http_code=$(echo "$approve_response" | grep "HTTP_CODE" | cut -d: -f2)
        approve_body=$(echo "$approve_response" | sed '/HTTP_CODE/d')
        
        if [ "$approve_http_code" = "200" ]; then
            echo -e "${GREEN}✓ Action approved successfully${NC}"
            echo "$approve_body" | jq . 2>/dev/null || echo "$approve_body"
        else
            echo -e "${RED}✗ Action approval failed (HTTP $approve_http_code)${NC}"
            echo "$approve_body"
        fi
    else
        echo -e "${YELLOW}No action proposal in response${NC}"
    fi
else
    echo -e "${RED}✗ Action request failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo "Session ID: $SESSION_ID"
echo "View full history: curl \"$BASE_URL/bfis/chat/history?sessionId=$SESSION_ID\" | jq ."

