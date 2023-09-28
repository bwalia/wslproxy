import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait


def test_clientIPRule(setup, request):
    driver = request.function.driver
    server_name = request.function.server_name
    targetHost = request.function.targetHost 

# Creating rule for allow request when the client IP is matched
    wait = WebDriverWait(driver, 15)

    def wait_for_element(by, selector):
      element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
      return element


    wait_for_element(By.XPATH, "//a[@href='#/profiles']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//a[@href='#/profiles/create']").click()
    wait_for_element(By.ID, "name").send_keys("qa_test")

    wait_for_element(By.XPATH, "//button[@type='submit']").click()
    wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']").click()
    time.sleep(2)
