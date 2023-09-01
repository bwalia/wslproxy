import time

from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
import os
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.select import Select



def test_clientIPRule(setup, request):
    driver = request.function.driver
    server_name = request.function.server_name
    targetHost = request.function.targetHost 

# Creating rule for allow request when the client IP is matched
    wait = WebDriverWait(driver, 20)

    def wait_for_element(by, selector):
      element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
      return element


    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Valid client IP match-py")

    wait_for_element(By.NAME, "match.rules.path").send_keys("/valid")
    wait_for_element(By.ID, "match.rules.country").click()
    driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Belgium (BE)')]"))
    wait_for_element(By.XPATH, "//li[contains(.,'Belgium (BE)')]").click()
    wait_for_element(By.ID, "match.rules.client_ip").send_keys("104.155.127.255")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.message").send_keys("Y2xpZW50LWlwLW1hdGNoZWQ=")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

# Creating rule with the invalid the client IP 

    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Invalid client IP match-py")

    wait_for_element(By.NAME, "match.rules.path").send_keys("/invalid")
    wait_for_element(By.ID, "match.rules.country").click()
    driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'India (IN)')]"))
    wait_for_element(By.XPATH, "//li[contains(.,'India (IN)')]").click()
    wait_for_element(By.ID, "match.rules.client_ip").send_keys("104.155.127.255")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("403")
    wait_for_element(By.NAME, "match.response.message").send_keys("Y2xpZW50LWlwLW1hdGNoZWQ=")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

# Creating rule for allow request when the client IP is matched with the condition starts with

    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Valid client IP match-starts_with-py")

    wait_for_element(By.NAME, "match.rules.path").send_keys("/start")
    wait_for_element(By.ID, "match.rules.country").click()
    driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Belgium (BE)')]"))
    wait_for_element(By.XPATH, "//li[contains(.,'Belgium (BE)')]").click()
    wait_for_element(By.ID, "match.rules.client_ip_key").click()
    wait_for_element(By.XPATH, "//li[contains(.,'Starts With')]").click()

    wait_for_element(By.ID, "match.rules.client_ip").send_keys("104.15")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.message").send_keys("Y2xpZW50LWlwLW1hdGNoZWQ=")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

    # Apply rules to the server
    time.sleep(2)
    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    wait_for_element(By.XPATH, "//div[@id='rules']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'Valid client IP match-py')]").click()
    except:
        time.sleep(2)
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Valid client IP match-py')]"))
        # Wait for the element to be clickable
        wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'Valid client IP match-py')]"))).click()
        print("rule not found")
    time.sleep(2)
    driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases"))
    wait.until(expected_conditions.element_to_be_clickable((By.CSS_SELECTOR, ".button-add-match_cases"))).click()
    time.sleep(2)  
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
    time.sleep(2)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'Invalid client IP match-py')]").click()
    except: 
        time.sleep(2)
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Invalid client IP match-py')]"))
        # Wait for the element to be clickable
        wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'Invalid client IP match-py')]"))).click()
        print("Rule not found")    
    time.sleep(2)
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()
    time.sleep(2)
    driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases"))
    wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()       
    wait_for_element(By.XPATH, "//div[@id='match_cases.1.statement']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'Valid client IP match-starts_with-py')]").click()
    except:    
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Valid client IP match-starts_with-py')]"))
        # Wait for the element to be clickable
        wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'Valid client IP match-starts_with-py')]"))).click()
        print("Rule not found")    
    
    wait_for_element(By.XPATH, "//div[@id='match_cases.1.condition']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()


    time.sleep(2)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    time.sleep(2)
    wait_for_element(By.XPATH, "//button[normalize-space()='Save']").click()
    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    driver.refresh()
    driver.back()
    driver.execute_script("location.reload()")


    # Clicking the sync API button
    time.sleep(4)
    sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
    sync_button.click()
    time.sleep(4)

    # Verifying the rule with valid client IP
    driver.get("http://"+server_name+"/valid")
    time.sleep(4)
    driver.refresh()
    response = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "client-ip-matched" in response
    #print(response)
    
 
    # Verifying the rule with invalid client IP
    driver.get("http://"+server_name+"/invalid")
    time.sleep(4)
    driver.refresh()
    response = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "Configuration not match" in response
    #print(response)
    

    # Verifying the rule with the valid client IP using key starts_with
    driver.get("http://"+server_name+"/start")
    time.sleep(4)
    driver.refresh()
    response = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "client-ip-matched" in response
    print(response)
   



